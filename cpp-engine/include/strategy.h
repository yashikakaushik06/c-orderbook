#pragma once
#include "types.h"
#include <vector>
#include <cstring>

// Rule-based signal generator. Runs after every IndicatorSnapshot.
// Emits a TradingSignal when conditions are met.
class StrategyEngine {
public:
    // Returns list of signals (usually 0 or 1, occasionally multiple on confluence)
    std::vector<TradingSignal> evaluate(const IndicatorSnapshot& snap) {
        std::vector<TradingSignal> signals;

        // ── Strategy 1: MACD crossover ────────────────────────────────────
        // BUY  when histogram flips from negative to positive
        // SELL when histogram flips from positive to negative
        if (prev_macd_hist_ != 0.0) {
            if (prev_macd_hist_ < 0.0 && snap.macd_histogram > 0.0) {
                signals.push_back(make_signal(snap, SignalType::BUY,
                    0.72, "MACD bullish crossover"));
            } else if (prev_macd_hist_ > 0.0 && snap.macd_histogram < 0.0) {
                signals.push_back(make_signal(snap, SignalType::SELL,
                    0.70, "MACD bearish crossover"));
            }
        }
        prev_macd_hist_ = snap.macd_histogram;

        // ── Strategy 2: RSI extremes ──────────────────────────────────────
        if (snap.rsi < 30.0 && prev_rsi_ >= 30.0) {
            signals.push_back(make_signal(snap, SignalType::BUY,
                0.65, "RSI oversold reversal"));
        } else if (snap.rsi > 70.0 && prev_rsi_ <= 70.0) {
            signals.push_back(make_signal(snap, SignalType::SELL,
                0.65, "RSI overbought reversal"));
        }
        // Alert (not actionable trade) when RSI stays extreme
        if (snap.rsi > 75.0 || snap.rsi < 25.0) {
            signals.push_back(make_signal(snap, SignalType::ALERT,
                snap.rsi > 75.0 ? (snap.rsi - 50) / 50.0 : (50 - snap.rsi) / 50.0,
                snap.rsi > 75.0 ? "RSI extreme overbought" : "RSI extreme oversold"));
        }
        prev_rsi_ = snap.rsi;

        // ── Strategy 3: EMA golden/death cross (9 vs 20) ─────────────────
        if (prev_ema9_ != 0.0 && prev_ema20_ != 0.0) {
            bool was_above = prev_ema9_ > prev_ema20_;
            bool is_above  = snap.ema_9  > snap.ema_20;
            if (!was_above && is_above) {
                signals.push_back(make_signal(snap, SignalType::BUY,
                    0.68, "EMA9 golden cross above EMA20"));
            } else if (was_above && !is_above) {
                signals.push_back(make_signal(snap, SignalType::SELL,
                    0.66, "EMA9 death cross below EMA20"));
            }
        }
        prev_ema9_  = snap.ema_9;
        prev_ema20_ = snap.ema_20;

        // ── Strategy 4: Bollinger squeeze breakout ────────────────────────
        if (prev_bb_width_ != 0.0) {
            bool squeeze  = prev_bb_width_ < 0.02;           // tight band
            bool breakout = snap.price > snap.bb_upper * 0.998 ||
                            snap.price < snap.bb_lower * 1.002;
            if (squeeze && breakout) {
                SignalType dir = snap.price > snap.bb_mid ? SignalType::BUY : SignalType::SELL;
                signals.push_back(make_signal(snap, dir, 0.60,
                    "Bollinger squeeze breakout"));
            }
        }
        prev_bb_width_ = snap.bb_width;

        return signals;
    }

private:
    TradingSignal make_signal(const IndicatorSnapshot& snap,
                              SignalType type, double confidence,
                              const char* reason) {
        TradingSignal sig{};
        std::memcpy(sig.symbol, snap.symbol, 8);
        sig.type         = type;
        sig.price        = snap.price;
        sig.confidence   = confidence;
        sig.timestamp_us = snap.timestamp_us;
        std::strncpy(sig.reason, reason, sizeof(sig.reason) - 1);
        return sig;
    }

    double prev_macd_hist_ = 0.0;
    double prev_rsi_       = 50.0;
    double prev_ema9_      = 0.0;
    double prev_ema20_     = 0.0;
    double prev_bb_width_  = 0.0;
};
