#pragma once
#include <cstdint>
#include <string>
#include <array>

// Raw price tick from exchange WebSocket feed
struct PriceTick {
    char     symbol[8];     // e.g. "BTCUSDT\0"
    double   price;
    double   volume;
    int64_t  timestamp_us;  // microseconds since epoch
    uint8_t  side;          // 0=buy 1=sell
};

// Computed indicator snapshot — emitted after every tick
struct IndicatorSnapshot {
    char     symbol[8];
    double   price;
    double   vwap;

    // RSI (14-period)
    double   rsi;

    // MACD (12, 26, 9)
    double   macd_line;
    double   macd_signal;
    double   macd_histogram;

    // Bollinger Bands (20, 2σ)
    double   bb_upper;
    double   bb_mid;
    double   bb_lower;
    double   bb_width;

    // EMAs
    double   ema_9;
    double   ema_20;
    double   ema_50;
    double   ema_200;

    // Volume
    double   volume_24h;
    double   volume_sma;    // 20-period volume SMA

    int64_t  timestamp_us;
    uint32_t tick_count;
};

// Order signal emitted by strategy layer
enum class SignalType : uint8_t {
    NONE = 0,
    BUY  = 1,
    SELL = 2,
    ALERT = 3
};

struct TradingSignal {
    char       symbol[8];
    SignalType type;
    double     price;
    double     confidence;  // 0.0 – 1.0
    char       reason[64];  // human-readable description
    int64_t    timestamp_us;
};

// System health metrics
struct SystemMetrics {
    double   avg_latency_us;
    double   p99_latency_us;
    double   p999_latency_us;
    uint64_t ticks_processed;
    uint64_t ticks_dropped;
    uint32_t active_threads;
    uint32_t queue_depth;
    double   cpu_usage_pct;
};
