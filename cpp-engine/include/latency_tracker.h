#pragma once
#include "types.h"
#include <array>
#include <atomic>
#include <algorithm>
#include <chrono>
#include <cstring>

// High-resolution latency histogram using lock-free atomic counters.
// Buckets are 10µs wide from 0–10ms, then overflow bucket.
class LatencyTracker {
public:
    static constexpr int NUM_BUCKETS = 1001; // 0–9990µs + overflow
    static constexpr int BUCKET_US   = 10;

    void record(int64_t latency_us) {
        if (latency_us < 0) latency_us = 0;
        int bucket = (int)(latency_us / BUCKET_US);
        if (bucket >= NUM_BUCKETS) bucket = NUM_BUCKETS - 1;
        buckets_[bucket].fetch_add(1, std::memory_order_relaxed);

        // Running sum for mean
        total_us_.fetch_add((uint64_t)latency_us, std::memory_order_relaxed);
        count_.fetch_add(1, std::memory_order_relaxed);

        // Track max
        uint64_t cur_max = max_us_.load(std::memory_order_relaxed);
        while ((uint64_t)latency_us > cur_max &&
               !max_us_.compare_exchange_weak(cur_max, (uint64_t)latency_us,
                   std::memory_order_relaxed)) {}
    }

    SystemMetrics snapshot(uint32_t active_threads, uint32_t queue_depth) const {
        uint64_t n = count_.load(std::memory_order_relaxed);
        if (n == 0) return {};

        double avg = (double)total_us_.load(std::memory_order_relaxed) / n;

        // Walk histogram for p99 and p99.9
        double p99_us = 0, p999_us = 0;
        uint64_t target99  = (uint64_t)(n * 0.99);
        uint64_t target999 = (uint64_t)(n * 0.999);
        uint64_t cumulative = 0;
        for (int i = 0; i < NUM_BUCKETS; i++) {
            cumulative += buckets_[i].load(std::memory_order_relaxed);
            double bucket_max = (i + 1) * BUCKET_US;
            if (p99_us  == 0 && cumulative >= target99)  p99_us  = bucket_max;
            if (p999_us == 0 && cumulative >= target999) p999_us = bucket_max;
        }

        SystemMetrics m{};
        m.avg_latency_us  = avg;
        m.p99_latency_us  = p99_us;
        m.p999_latency_us = p999_us;
        m.ticks_processed = n;
        m.active_threads  = active_threads;
        m.queue_depth     = queue_depth;
        return m;
    }

    void reset() {
        for (auto& b : buckets_) b.store(0, std::memory_order_relaxed);
        total_us_.store(0, std::memory_order_relaxed);
        count_.store(0, std::memory_order_relaxed);
        max_us_.store(0, std::memory_order_relaxed);
    }

private:
    std::array<std::atomic<uint64_t>, NUM_BUCKETS> buckets_{};
    std::atomic<uint64_t> total_us_{0};
    std::atomic<uint64_t> count_{0};
    std::atomic<uint64_t> max_us_{0};
};

// RAII timer that records on destruction
class ScopedTimer {
public:
    explicit ScopedTimer(LatencyTracker& tracker)
        : tracker_(tracker),
          start_(std::chrono::high_resolution_clock::now()) {}

    ~ScopedTimer() {
        auto end = std::chrono::high_resolution_clock::now();
        int64_t us = std::chrono::duration_cast<std::chrono::microseconds>(end - start_).count();
        tracker_.record(us);
    }

private:
    LatencyTracker& tracker_;
    std::chrono::time_point<std::chrono::high_resolution_clock> start_;
};
