/*
 * test_indicators.cpp
 * Lightweight unit tests — no external test framework needed.
 * Build with CMake and run: ctest --output-on-failure
 */

#include "engine.h"
#include <cassert>
#include <cmath>
#include <iostream>
#include <vector>

namespace {

// ─── Helpers ──────────────────────────────────────────────────────────────────

algo::Tick make_tick(const char* sym, double price, double vol = 1.0,
                     uint64_t ts_ns = 0) {
    algo::Tick t{};
    t.price        = price;
    t.volume       = vol;
    t.timestamp_ns = ts_ns;
    std::strncpy(t.symbol, sym, 7);
    return t;
}

bool approx(double a, double b, double eps = 0.01) {
    return std::abs(a - b) < eps;
}

// ─── Test: RSI bounds ─────────────────────────────────────────────────────────
void test_rsi_bounds() {
    algo::IndicatorCalc calc("TEST", 14);

    // Feed 30 rising prices → RSI should approach 100
    for (int i = 0; i < 30; ++i) {
        auto ind = calc.update(make_tick("TEST", 100.0 + i, 1.0,
                               (uint64_t)i * 1'000'000'000ULL));
        if (ind.valid) {
            assert(ind.rsi >= 0.0 && ind.rsi <= 100.0);
        }
    }

    // Feed 30 falling prices → RSI should approach 0
    algo::IndicatorCalc calc2("TEST2", 14);
    for (int i = 0; i < 30; ++i) {
        auto ind = calc2.update(make_tick("TEST2", 100.0 - i, 1.0,
                                (uint64_t)i * 1'000'000'000ULL));
        if (ind.valid) {
            assert(ind.rsi >= 0.0 && ind.rsi <= 100.0);
        }
    }

    // Monotone rise: RSI > 50
    {
        algo::IndicatorCalc c("T3", 14);
        algo::Indicators last{};
        for (int i = 0; i < 30; ++i)
            last = c.update(make_tick("T3", 100.0 + i, 1.0,
                            (uint64_t)i * 1e9));
        assert(last.valid && last.rsi > 50.0);
    }

    std::cout << "[PASS] test_rsi_bounds\n";
}

// ─── Test: EMA convergence ────────────────────────────────────────────────────
void test_ema_convergence() {
    algo::IndicatorCalc calc("EMA", 14, 12, 26, 9, 20);
    // Constant price: EMA fast and slow should converge to price
    const double price = 250.0;
    algo::Indicators last{};
    for (int i = 0; i < 100; ++i)
        last = calc.update(make_tick("EMA", price, 1.0, (uint64_t)i * 1e9));

    assert(approx(last.ema_fast, price, 0.1));
    assert(approx(last.ema_slow, price, 0.1));
    assert(approx(last.macd, 0.0, 0.5));
    std::cout << "[PASS] test_ema_convergence\n";
}

// ─── Test: Bollinger bands contain price for constant series ─────────────────
void test_bollinger_flat() {
    algo::IndicatorCalc calc("BB", 14, 12, 26, 9, 20);
    algo::Indicators last{};
    for (int i = 0; i < 40; ++i)
        last = calc.update(make_tick("BB", 100.0, 1.0, (uint64_t)i * 1e9));

    // Flat price → stddev = 0 → all three bands = price
    assert(last.valid);
    assert(approx(last.bb_upper, 100.0, 0.01));
    assert(approx(last.bb_lower, 100.0, 0.01));
    assert(approx(last.bb_middle, 100.0, 0.01));
    std::cout << "[PASS] test_bollinger_flat\n";
}

// ─── Test: VWAP price × volume weighting ─────────────────────────────────────
void test_vwap() {
    algo::IndicatorCalc calc("VW", 14);
    // Two ticks: price=100 vol=1, price=200 vol=3 → VWAP = (100+600)/4 = 175
    calc.update(make_tick("VW", 100.0, 1.0, 1'000'000'000ULL));
    auto ind = calc.update(make_tick("VW", 200.0, 3.0, 2'000'000'000ULL));
    assert(approx(ind.vwap, 175.0, 0.1));
    std::cout << "[PASS] test_vwap\n";
}

// ─── Test: Ring buffer SPSC correctness ───────────────────────────────────────
void test_ring_buffer() {
    algo::RingBuffer<int, 8> rb;
    assert(rb.empty());
    assert(rb.push(1));
    assert(rb.push(2));
    assert(rb.push(3));
    assert(rb.size() == 3);

    int v = 0;
    assert(rb.pop(v) && v == 1);
    assert(rb.pop(v) && v == 2);
    assert(rb.pop(v) && v == 3);
    assert(rb.empty());

    // Fill to capacity
    for (int i = 0; i < 7; ++i) assert(rb.push(i));
    assert(!rb.push(99));  // full (capacity = N-1 = 7)

    std::cout << "[PASS] test_ring_buffer\n";
}

// ─── Test: Indicator validity gating ─────────────────────────────────────────
void test_validity_gate() {
    algo::IndicatorCalc calc("GATE", 14, 12, 26, 9, 20);
    // valid should become true only after >= ema_slow (26) ticks
    int first_valid = -1;
    for (int i = 0; i < 50; ++i) {
        auto ind = calc.update(make_tick("GATE", 100.0 + i * 0.5, 1.0,
                               (uint64_t)i * 1e9));
        if (ind.valid && first_valid < 0) first_valid = i;
    }
    assert(first_valid >= 25);  // at least ema_slow - 1 ticks before valid
    std::cout << "[PASS] test_validity_gate (first valid at tick " << first_valid << ")\n";
}

} // anonymous namespace

int main() {
    std::cout << "=== AlgoEngine Indicator Tests ===\n";
    try {
        test_ring_buffer();
        test_rsi_bounds();
        test_ema_convergence();
        test_bollinger_flat();
        test_vwap();
        test_validity_gate();
        std::cout << "\n[ALL TESTS PASSED]\n";
        return 0;
    } catch (const std::exception& e) {
        std::cerr << "\n[FAIL] Exception: " << e.what() << "\n";
        return 1;
    } catch (...) {
        std::cerr << "\n[FAIL] Unknown exception\n";
        return 1;
    }
}
