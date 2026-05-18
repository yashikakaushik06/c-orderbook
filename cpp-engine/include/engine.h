#pragma once

#include <atomic>
#include <array>
#include <cstdint>
#include <string>
#include <functional>
#include <memory>
#include <vector>
#include <chrono>
#include <optional>

namespace algo {

// ─── Tick Data ────────────────────────────────────────────────────────────────
struct Tick {
    double     price;
    double     volume;
    uint64_t   timestamp_ns;  // nanoseconds since epoch
    char       symbol[8];     // null-terminated, max 7 chars
};

// ─── Computed Indicators ──────────────────────────────────────────────────────
struct Indicators {
    double rsi;           // 0–100
    double macd;          // MACD line value
    double macd_signal;   // Signal line
    double macd_hist;     // Histogram
    double ema_fast;      // EMA(12)
    double ema_slow;      // EMA(26)
    double bb_upper;      // Bollinger upper band
    double bb_middle;     // Bollinger middle (SMA20)
    double bb_lower;      // Bollinger lower band
    double bb_width;      // Normalized bandwidth
    double vwap;          // Volume-weighted average price
    double volume_24h;    // Rolling 24h volume
    uint64_t timestamp_ns;
    char   symbol[8];
    bool   valid;         // false until enough data accumulated
};

// ─── Alert ────────────────────────────────────────────────────────────────────
enum class AlertType { BUY_SIGNAL, SELL_SIGNAL, WARNING, INFO };

struct Alert {
    AlertType   type;
    std::string message;
    double      price;
    uint64_t    timestamp_ns;
    char        symbol[8];
};

// ─── Lock-Free Ring Buffer ─────────────────────────────────────────────────────
// Single-producer, single-consumer (SPSC). Uses cache-line padding to prevent
// false sharing between head and tail on different cores.
template<typename T, size_t N>
class RingBuffer {
    static_assert((N & (N - 1)) == 0, "N must be a power of 2");

    struct alignas(64) PaddedAtomic {
        std::atomic<size_t> v{0};
        char padding[64 - sizeof(std::atomic<size_t>)];
    };

    alignas(64) std::array<T, N> buf_{};
    PaddedAtomic head_;  // written by producer
    PaddedAtomic tail_;  // written by consumer

public:
    // Returns false if buffer full
    bool push(const T& item) noexcept {
        const size_t h = head_.v.load(std::memory_order_relaxed);
        const size_t next = (h + 1) & (N - 1);
        if (next == tail_.v.load(std::memory_order_acquire)) return false;
        buf_[h] = item;
        head_.v.store(next, std::memory_order_release);
        return true;
    }

    // Returns false if buffer empty
    bool pop(T& out) noexcept {
        const size_t t = tail_.v.load(std::memory_order_relaxed);
        if (t == head_.v.load(std::memory_order_acquire)) return false;
        out = buf_[t];
        tail_.v.store((t + 1) & (N - 1), std::memory_order_release);
        return true;
    }

    bool empty() const noexcept {
        return tail_.v.load(std::memory_order_acquire) ==
               head_.v.load(std::memory_order_acquire);
    }

    size_t size() const noexcept {
        const size_t h = head_.v.load(std::memory_order_acquire);
        const size_t t = tail_.v.load(std::memory_order_acquire);
        return (h - t + N) & (N - 1);
    }
};

// ─── Indicator Calculator ─────────────────────────────────────────────────────
// All indicators computed incrementally (O(1) per tick after warmup).
class IndicatorCalc {
public:
    explicit IndicatorCalc(const std::string& symbol,
                           int rsi_period   = 14,
                           int ema_fast     = 12,
                           int ema_slow     = 26,
                           int macd_signal  = 9,
                           int bb_period    = 20);

    // Feed a new tick. Returns computed indicators (valid=false during warmup).
    Indicators update(const Tick& tick);

    void reset();

private:
    // EMA helpers
    double ema(double prev_ema, double price, double k) const noexcept {
        return price * k + prev_ema * (1.0 - k);
    }

    // Bollinger bands over internal price window
    void compute_bollinger();

    std::string symbol_;

    // Periods
    int rsi_period_, ema_fast_period_, ema_slow_period_;
    int macd_signal_period_, bb_period_;

    // EMA smoothing factors
    double k_fast_, k_slow_, k_signal_;

    // Running state
    int    tick_count_{0};
    double prev_close_{0.0};
    double avg_gain_{0.0}, avg_loss_{0.0};

    double ema_fast_{0.0}, ema_slow_{0.0}, macd_signal_{0.0};

    // Price window for Bollinger / VWAP
    std::vector<double> price_window_;   // last bb_period_ prices
    double vwap_cum_pv_{0.0};           // cumulative price*volume
    double vwap_cum_v_{0.0};            // cumulative volume
    uint64_t vwap_reset_ns_{0};         // reset every 24 hours

    double bb_upper_{0.0}, bb_middle_{0.0}, bb_lower_{0.0};

    double volume_24h_{0.0};
    // Sliding 24h volume window (1-minute buckets × 1440)
    std::array<double, 1440> vol_buckets_{};
    int    vol_bucket_idx_{0};
    uint64_t last_bucket_ns_{0};
};

// ─── Analytics Engine ──────────────────────────────────────────────────────────
// Manages per-symbol calculators, runs on a dedicated thread pool.
class AnalyticsEngine {
public:
    using IndicatorCallback = std::function<void(const Indicators&)>;
    using AlertCallback     = std::function<void(const Alert&)>;

    struct Config {
        size_t thread_count   = 4;
        size_t ring_buf_size  = 4096;   // must be power of 2
        int    rsi_period     = 14;
        int    ema_fast       = 12;
        int    ema_slow       = 26;
        int    macd_signal    = 9;
        int    bb_period      = 20;
        double rsi_overbought = 70.0;
        double rsi_oversold   = 30.0;
    };

    explicit AnalyticsEngine(Config cfg = {});
    ~AnalyticsEngine();

    // Non-copyable
    AnalyticsEngine(const AnalyticsEngine&)            = delete;
    AnalyticsEngine& operator=(const AnalyticsEngine&) = delete;

    void start();
    void stop();

    // Thread-safe: called from WebSocket ingestion thread
    bool ingest(const Tick& tick);

    void set_indicator_callback(IndicatorCallback cb);
    void set_alert_callback(AlertCallback cb);

    // Diagnostics
    uint64_t ticks_processed() const noexcept;
    double   avg_latency_us()  const noexcept;
    double   p99_latency_us()  const noexcept;

private:
    void worker_loop();
    void check_alerts(const Indicators& ind);

    Config cfg_;

    // SPSC ring buffer (tick ingestion → worker)
    RingBuffer<Tick, 4096> ring_;

    std::atomic<bool>       running_{false};
    std::vector<std::thread> workers_;

    // Per-symbol calculators (created on first tick for that symbol)
    struct SymbolCtx {
        std::unique_ptr<IndicatorCalc> calc;
        std::optional<double>          prev_macd;
    };
    std::unordered_map<std::string, SymbolCtx> symbol_ctxs_;
    std::mutex                                  ctx_mu_;

    IndicatorCallback ind_cb_;
    AlertCallback     alert_cb_;
    std::mutex        cb_mu_;

    // Latency tracking (circular histogram)
    std::atomic<uint64_t> ticks_processed_{0};
    std::array<std::atomic<uint64_t>, 1024> latency_hist_{};  // 1µs buckets
};

} // namespace algo
