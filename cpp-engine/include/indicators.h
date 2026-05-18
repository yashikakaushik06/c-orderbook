#pragma once
#include "types.h"
#include <deque>
#include <cmath>
#include <numeric>
#include <stdexcept>

// ── Incremental EMA ────────────────────────────────────────────────────────
// O(1) per tick. Multiplier k = 2 / (period + 1)
class EMA {
public:
    explicit EMA(int period)
        : period_(period), k_(2.0 / (period + 1)), value_(0.0), initialized_(false) {}

    double update(double price) {
        if (!initialized_) {
            // Seed with first price; proper seed after `period_` samples
            sum_ += price;
            count_++;
            if (count_ >= period_) {
                value_ = sum_ / period_;
                initialized_ = true;
            }
            return value_;
        }
        value_ = price * k_ + value_ * (1.0 - k_);
        return value_;
    }

    double value() const { return value_; }
    bool   ready() const { return initialized_; }

private:
    int    period_;
    double k_;
    double value_;
    double sum_   = 0.0;
    int    count_ = 0;
    bool   initialized_;
};

// ── RSI (Wilder's smoothed method) ─────────────────────────────────────────
// O(1) per tick after warm-up
class RSI {
public:
    explicit RSI(int period = 14) : period_(period) {}

    double update(double price) {
        if (prev_price_ == 0.0) {
            prev_price_ = price;
            return 50.0;
        }
        double change = price - prev_price_;
        prev_price_ = price;

        double gain = change > 0 ? change : 0.0;
        double loss = change < 0 ? -change : 0.0;

        if (count_ < period_) {
            gain_sum_ += gain;
            loss_sum_ += loss;
            count_++;
            if (count_ == period_) {
                avg_gain_ = gain_sum_ / period_;
                avg_loss_ = loss_sum_ / period_;
            }
            return 50.0;
        }

        // Wilder smoothing
        avg_gain_ = (avg_gain_ * (period_ - 1) + gain) / period_;
        avg_loss_ = (avg_loss_ * (period_ - 1) + loss) / period_;

        if (avg_loss_ == 0.0) return 100.0;
        double rs = avg_gain_ / avg_loss_;
        return 100.0 - (100.0 / (1.0 + rs));
    }

private:
    int    period_;
    double prev_price_ = 0.0;
    double gain_sum_   = 0.0;
    double loss_sum_   = 0.0;
    double avg_gain_   = 0.0;
    double avg_loss_   = 0.0;
    int    count_      = 0;
};

// ── MACD ───────────────────────────────────────────────────────────────────
// Standard (12, 26, 9). All O(1).
struct MACDResult { double line, signal, histogram; };

class MACD {
public:
    MACD(int fast = 12, int slow = 26, int signal = 9)
        : fast_ema_(fast), slow_ema_(slow), signal_ema_(signal) {}

    MACDResult update(double price) {
        double fast_val = fast_ema_.update(price);
        double slow_val = slow_ema_.update(price);
        double macd_val = fast_val - slow_val;
        double sig_val  = signal_ema_.update(macd_val);
        return { macd_val, sig_val, macd_val - sig_val };
    }

private:
    EMA fast_ema_, slow_ema_, signal_ema_;
};

// ── Bollinger Bands (rolling window) ───────────────────────────────────────
struct BBResult { double upper, mid, lower, width; };

class BollingerBands {
public:
    explicit BollingerBands(int period = 20, double num_std = 2.0)
        : period_(period), num_std_(num_std) {}

    BBResult update(double price) {
        window_.push_back(price);
        if ((int)window_.size() > period_) window_.pop_front();

        double sum = 0.0;
        for (double p : window_) sum += p;
        double mean = sum / window_.size();

        double var = 0.0;
        for (double p : window_) var += (p - mean) * (p - mean);
        double stddev = std::sqrt(var / window_.size());

        double upper = mean + num_std_ * stddev;
        double lower = mean - num_std_ * stddev;
        double width = (upper - lower) / mean;
        return { upper, mean, lower, width };
    }

private:
    int            period_;
    double         num_std_;
    std::deque<double> window_;
};

// ── VWAP (session-based) ───────────────────────────────────────────────────
class VWAP {
public:
    void update(double price, double volume) {
        cum_pv_    += price * volume;
        cum_vol_   += volume;
    }
    double value() const {
        return cum_vol_ > 0 ? cum_pv_ / cum_vol_ : 0.0;
    }
    void reset() { cum_pv_ = 0.0; cum_vol_ = 0.0; }

private:
    double cum_pv_  = 0.0;
    double cum_vol_ = 0.0;
};

// ── Composite indicator engine for one symbol ──────────────────────────────
class IndicatorEngine {
public:
    IndicatorEngine()
        : rsi_(14), macd_(12, 26, 9), bb_(20, 2.0),
          ema9_(9), ema20_(20), ema50_(50), ema200_(200) {}

    IndicatorSnapshot compute(const PriceTick& tick) {
        IndicatorSnapshot snap{};
        std::memcpy(snap.symbol, tick.symbol, 8);
        snap.price        = tick.price;
        snap.timestamp_us = tick.timestamp_us;
        snap.tick_count   = ++tick_count_;

        snap.rsi          = rsi_.update(tick.price);
        auto m            = macd_.update(tick.price);
        snap.macd_line    = m.line;
        snap.macd_signal  = m.signal;
        snap.macd_histogram = m.histogram;
        auto bb           = bb_.update(tick.price);
        snap.bb_upper     = bb.upper;
        snap.bb_mid       = bb.mid;
        snap.bb_lower     = bb.lower;
        snap.bb_width     = bb.width;
        snap.ema_9        = ema9_.update(tick.price);
        snap.ema_20       = ema20_.update(tick.price);
        snap.ema_50       = ema50_.update(tick.price);
        snap.ema_200      = ema200_.update(tick.price);

        vwap_.update(tick.price, tick.volume);
        snap.vwap         = vwap_.value();

        vol_24h_          += tick.volume;
        snap.volume_24h   = vol_24h_;

        return snap;
    }

private:
    RSI            rsi_;
    MACD           macd_;
    BollingerBands bb_;
    EMA            ema9_, ema20_, ema50_, ema200_;
    VWAP           vwap_;
    double         vol_24h_ = 0.0;
    uint32_t       tick_count_ = 0;
};
