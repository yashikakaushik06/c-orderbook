// src/bench.cpp
// Standalone benchmark for the analytics engine.
// Measures throughput (ticks/sec) and latency distribution.
// Build: cmake .. && make && ./engine_bench

#include "engine.cpp"
#include <iostream>
#include <iomanip>
#include <chrono>
#include <cstring>
#include <random>

int main() {
    std::cout << "AlgoEngine Benchmark\n";
    std::cout << "====================\n\n";

    AnalyticsEngine engine(8);

    engine.add_symbol("BTCUSD");
    engine.add_symbol("ETHUSD");
    engine.add_symbol("SOLUSD");

    std::atomic<uint64_t> snap_count{0};
    std::atomic<uint64_t> sig_count{0};

    engine.on_snapshot([&](const IndicatorSnapshot&) { snap_count++; });
    engine.on_signal([&](const TradingSignal& sig) {
        sig_count++;
        std::cout << "[SIGNAL] " << sig.symbol << " "
                  << (sig.type == SignalType::BUY  ? "BUY"  :
                      sig.type == SignalType::SELL ? "SELL" : "ALERT")
                  << " @ " << std::fixed << std::setprecision(2) << sig.price
                  << " — " << sig.reason << "\n";
    });

    engine.start();

    const int N_TICKS = 100000;
    std::mt19937  rng(42);
    std::normal_distribution<double> price_dist(0, 1);

    const char* syms[] = { "BTCUSD", "ETHUSD", "SOLUSD" };
    double prices[] = { 67500.0, 3500.0, 145.0 };

    std::cout << "Ingesting " << N_TICKS << " ticks across 3 symbols...\n";

    auto t0 = std::chrono::high_resolution_clock::now();

    for (int i = 0; i < N_TICKS; i++) {
        int idx = i % 3;
        prices[idx] += price_dist(rng) * prices[idx] * 0.001;

        PriceTick tick{};
        std::strncpy(tick.symbol, syms[idx], 7);
        tick.price        = prices[idx];
        tick.volume       = 0.1 + (rng() % 100) / 100.0;
        tick.timestamp_us = std::chrono::duration_cast<std::chrono::microseconds>(
            std::chrono::system_clock::now().time_since_epoch()).count();
        tick.side = i % 2;

        engine.ingest(tick);
    }

    // Wait for processing to drain
    std::this_thread::sleep_for(std::chrono::milliseconds(200));

    auto t1 = std::chrono::high_resolution_clock::now();
    double elapsed_s = std::chrono::duration<double>(t1 - t0).count();

    std::cout << "\n── Results ──────────────────────────────\n";
    std::cout << "Total time:       " << std::fixed << std::setprecision(3) << elapsed_s * 1000 << " ms\n";
    std::cout << "Throughput:       " << (int)(N_TICKS / elapsed_s) << " ticks/sec\n";
    std::cout << "Snapshots fired:  " << snap_count.load() << "\n";
    std::cout << "Signals fired:    " << sig_count.load()  << "\n";

    engine.stop();
    return 0;
}
