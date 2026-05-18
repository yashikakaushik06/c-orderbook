#include "ring_buffer.h"
#include "indicators.h"
#include "strategy.h"
#include "thread_pool.h"
#include "latency_tracker.h"
#include "types.h"

#include <unordered_map>
#include <functional>
#include <atomic>
#include <mutex>
#include <string>
#include <thread>
#include <chrono>
#include <iostream>
#include <cstring>

// ── AnalyticsEngine ──────────────────────────────────────────────────────
// Central coordinator. One ring buffer per tracked symbol.
// Thread pool processes ticks; callbacks notify the Node.js binding layer.
class AnalyticsEngine {
public:
    using SnapshotCb = std::function<void(const IndicatorSnapshot&)>;
    using SignalCb   = std::function<void(const TradingSignal&)>;
    using MetricsCb  = std::function<void(const SystemMetrics&)>;

    explicit AnalyticsEngine(size_t num_threads = 8)
        : pool_(num_threads), num_threads_(num_threads), running_(false) {}

    void on_snapshot(SnapshotCb cb) { snapshot_cb_ = std::move(cb); }
    void on_signal  (SignalCb   cb) { signal_cb_   = std::move(cb); }
    void on_metrics (MetricsCb  cb) { metrics_cb_  = std::move(cb); }

    void add_symbol(const std::string& sym) {
        std::unique_lock<std::mutex> lock(symbols_mutex_);
        if (engines_.find(sym) == engines_.end()) {
            engines_[sym]    = std::make_unique<IndicatorEngine>();
            strategies_[sym] = std::make_unique<StrategyEngine>();
            buffers_[sym]    = std::make_unique<Buffer>();
        }
    }

    bool ingest(const PriceTick& tick) {
        std::string sym(tick.symbol);
        {
            std::unique_lock<std::mutex> lock(symbols_mutex_);
            if (buffers_.find(sym) == buffers_.end()) {
                engines_[sym]    = std::make_unique<IndicatorEngine>();
                strategies_[sym] = std::make_unique<StrategyEngine>();
                buffers_[sym]    = std::make_unique<Buffer>();
            }
        }
        bool ok = buffers_[sym]->push(tick);
        if (!ok) dropped_.fetch_add(1, std::memory_order_relaxed);
        pool_.enqueue([this, sym]() { process_next(sym); });
        return ok;
    }

    void start() {
        running_.store(true);
        metrics_thread_ = std::thread([this]() {
            while (running_.load()) {
                std::this_thread::sleep_for(std::chrono::seconds(1));
                if (metrics_cb_) {
                    auto m = latency_.snapshot(
                        (uint32_t)pool_.active_count(),
                        (uint32_t)pool_.queue_size());
                    m.ticks_dropped = dropped_.load();
                    metrics_cb_(m);
                }
            }
        });
    }

    void stop() {
        running_.store(false);
        if (metrics_thread_.joinable()) metrics_thread_.join();
    }

    ~AnalyticsEngine() { stop(); }

private:
    using Buffer = RingBuffer<PriceTick, 4096>;

    void process_next(const std::string& sym) {
        auto tick_opt = buffers_[sym]->pop();
        if (!tick_opt) return;

        auto t0 = std::chrono::high_resolution_clock::now();

        IndicatorSnapshot snap;
        {
            std::unique_lock<std::mutex> lock(engines_mutex_);
            snap = engines_[sym]->compute(*tick_opt);
        }

        std::vector<TradingSignal> signals;
        {
            std::unique_lock<std::mutex> lock(strategies_mutex_);
            signals = strategies_[sym]->evaluate(snap);
        }

        auto t1 = std::chrono::high_resolution_clock::now();
        latency_.record(
            std::chrono::duration_cast<std::chrono::microseconds>(t1 - t0).count());

        if (snapshot_cb_) snapshot_cb_(snap);
        for (auto& sig : signals)
            if (signal_cb_) signal_cb_(sig);
    }

    ThreadPool   pool_;
    size_t       num_threads_;
    std::atomic<bool> running_;
    std::thread  metrics_thread_;

    std::unordered_map<std::string, std::unique_ptr<Buffer>>          buffers_;
    std::unordered_map<std::string, std::unique_ptr<IndicatorEngine>> engines_;
    std::unordered_map<std::string, std::unique_ptr<StrategyEngine>>  strategies_;
    std::mutex engines_mutex_, strategies_mutex_, symbols_mutex_;

    LatencyTracker        latency_;
    std::atomic<uint64_t> dropped_{0};

    SnapshotCb snapshot_cb_;
    SignalCb   signal_cb_;
    MetricsCb  metrics_cb_;
};
