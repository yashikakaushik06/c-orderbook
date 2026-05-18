#include "engine.h"
#include <cmath>
#include <numeric>
#include <algorithm>
#include <cstring>

namespace algo {

// ─── IndicatorCalc ────────────────────────────────────────────────────────────

IndicatorCalc::IndicatorCalc(const std::string& symbol,
                             int rsi_period, int ema_fast, int ema_slow,
                             int macd_signal, int bb_period)
    : symbol_(symbol)
    , rsi_period_(rsi_period)
    , ema_fast_period_(ema_fast)
    , ema_slow_period_(ema_slow)
    , macd_signal_period_(macd_signal)
    , bb_period_(bb_period)
    , k_fast_(2.0 / (ema_fast  + 1))
    , k_slow_(2.0 / (ema_slow  + 1))
    , k_signal_(2.0 / (macd_signal + 1))
{
    price_window_.reserve(bb_period_);
    vol_buckets_.fill(0.0);
}

void IndicatorCalc::reset() {
    tick_count_  = 0;
    prev_close_  = 0.0;
    avg_gain_    = 0.0;
    avg_loss_    = 0.0;
    ema_fast_    = 0.0;
    ema_slow_    = 0.0;
    macd_signal_ = 0.0;
    price_window_.clear();
    vwap_cum_pv_ = 0.0;
    vwap_cum_v_  = 0.0;
    vwap_reset_ns_ = 0;
    volume_24h_  = 0.0;
    vol_buckets_.fill(0.0);
    vol_bucket_idx_ = 0;
}

Indicators IndicatorCalc::update(const Tick& tick) {
    Indicators ind{};
    ind.timestamp_ns = tick.timestamp_ns;
    std::strncpy(ind.symbol, symbol_.c_str(), 7);
    ind.symbol[7] = '\0';

    const double price  = tick.price;
    const double volume = tick.volume;

    // ── Volume / VWAP ──────────────────────────────────────────────────────
    // Reset VWAP every 24 hours
    constexpr uint64_t NS_PER_DAY = 86400ULL * 1'000'000'000ULL;
    if (vwap_reset_ns_ == 0 || (tick.timestamp_ns - vwap_reset_ns_) >= NS_PER_DAY) {
        vwap_cum_pv_  = 0.0;
        vwap_cum_v_   = 0.0;
        vwap_reset_ns_ = tick.timestamp_ns;
    }
    vwap_cum_pv_ += price * volume;
    vwap_cum_v_  += volume;
    ind.vwap = (vwap_cum_v_ > 0.0) ? (vwap_cum_pv_ / vwap_cum_v_) : price;

    // 24h rolling volume (1-minute buckets)
    {
        constexpr uint64_t NS_PER_MINUTE = 60ULL * 1'000'000'000ULL;
        uint64_t bucket_id = tick.timestamp_ns / NS_PER_MINUTE;
        if (last_bucket_ns_ == 0) last_bucket_ns_ = bucket_id;
        int64_t buckets_elapsed = static_cast<int64_t>(bucket_id - last_bucket_ns_);
        if (buckets_elapsed > 0) {
            // Clear elapsed buckets
            for (int64_t i = 0; i < std::min(buckets_elapsed, (int64_t)1440); ++i) {
                vol_bucket_idx_ = (vol_bucket_idx_ + 1) % 1440;
                volume_24h_    -= vol_buckets_[vol_bucket_idx_];
                vol_buckets_[vol_bucket_idx_] = 0.0;
            }
            last_bucket_ns_ = bucket_id;
        }
        vol_buckets_[vol_bucket_idx_] += volume;
        volume_24h_ += volume;
    }
    ind.volume_24h = volume_24h_;

    // ── EMA (fast & slow) ─────────────────────────────────────────────────
    if (tick_count_ == 0) {
        ema_fast_ = price;
        ema_slow_ = price;
    } else {
        ema_fast_ = ema(ema_fast_, price, k_fast_);
        ema_slow_ = ema(ema_slow_, price, k_slow_);
    }
    ind.ema_fast = ema_fast_;
    ind.ema_slow = ema_slow_;

    // ── MACD ─────────────────────────────────────────────────────────────
    const double macd_line = ema_fast_ - ema_slow_;
    if (tick_count_ == 0) macd_signal_ = macd_line;
    else macd_signal_ = ema(macd_signal_, macd_line, k_signal_);
    ind.macd        = macd_line;
    ind.macd_signal = macd_signal_;
    ind.macd_hist   = macd_line - macd_signal_;

    // ── RSI (Wilder smoothing) ────────────────────────────────────────────
    if (tick_count_ > 0) {
        const double delta = price - prev_close_;
        const double gain  = delta > 0.0 ? delta : 0.0;
        const double loss  = delta < 0.0 ? -delta : 0.0;

        if (tick_count_ == 1) {
            // Seed the first average
            avg_gain_ = gain;
            avg_loss_ = loss;
        } else if (tick_count_ <= rsi_period_) {
            // Simple average for first period
            avg_gain_ = (avg_gain_ * (tick_count_ - 1) + gain) / tick_count_;
            avg_loss_ = (avg_loss_ * (tick_count_ - 1) + loss) / tick_count_;
        } else {
            // Wilder smoothing
            avg_gain_ = (avg_gain_ * (rsi_period_ - 1) + gain) / rsi_period_;
            avg_loss_ = (avg_loss_ * (rsi_period_ - 1) + loss) / rsi_period_;
        }
    }
    if (tick_count_ >= rsi_period_ && avg_loss_ > 0.0) {
        const double rs = avg_gain_ / avg_loss_;
        ind.rsi = 100.0 - (100.0 / (1.0 + rs));
    } else if (tick_count_ >= rsi_period_) {
        ind.rsi = 100.0;  // no losses → fully overbought
    } else {
        ind.rsi = 50.0;   // not enough data
    }

    // ── Bollinger Bands ──────────────────────────────────────────────────
    if ((int)price_window_.size() >= bb_period_) {
        price_window_.erase(price_window_.begin());
    }
    price_window_.push_back(price);

    if ((int)price_window_.size() >= bb_period_) {
        compute_bollinger();
    }
    ind.bb_upper  = bb_upper_;
    ind.bb_middle = bb_middle_;
    ind.bb_lower  = bb_lower_;
    ind.bb_width  = (bb_middle_ > 0.0)
                    ? (bb_upper_ - bb_lower_) / bb_middle_
                    : 0.0;

    prev_close_ = price;
    ++tick_count_;

    // Valid after enough data for the slowest indicator (EMA slow period)
    ind.valid = (tick_count_ >= ema_slow_period_);
    return ind;
}

void IndicatorCalc::compute_bollinger() {
    const int n = static_cast<int>(price_window_.size());
    if (n == 0) return;

    // Mean (SMA)
    double sum = 0.0;
    for (double p : price_window_) sum += p;
    const double mean = sum / n;

    // Standard deviation
    double sq_sum = 0.0;
    for (double p : price_window_) {
        const double d = p - mean;
        sq_sum += d * d;
    }
    const double stddev = std::sqrt(sq_sum / n);

    bb_middle_ = mean;
    bb_upper_  = mean + 2.0 * stddev;
    bb_lower_  = mean - 2.0 * stddev;
}

} // namespace algo
