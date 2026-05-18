// bindings/engine_binding.cpp
// N-API (node-addon-api) binding — exposes AnalyticsEngine to Node.js
// Build: node-gyp configure build
// Usage: const engine = require('./build/Release/algo_engine');

#include <napi.h>
#include <memory>
#include <mutex>
#include <queue>
#include <string>
#include <chrono>

// Include the engine (single-translation-unit build for simplicity)
#include "../cpp-engine/src/engine.cpp"

// ── Thread-safe callback queue ────────────────────────────────────────────
// N-API callbacks must fire on the V8 main thread.
// We queue serialized JSON strings and drain via uv_async_t.

struct CallbackPayload {
    enum Type { SNAPSHOT, SIGNAL, METRICS } type;
    std::string json;
};

class EngineWrapper : public Napi::ObjectWrap<EngineWrapper> {
public:
    static Napi::Object Init(Napi::Env env, Napi::Object exports) {
        Napi::Function func = DefineClass(env, "AnalyticsEngine", {
            InstanceMethod("addSymbol",      &EngineWrapper::AddSymbol),
            InstanceMethod("ingestTick",     &EngineWrapper::IngestTick),
            InstanceMethod("start",          &EngineWrapper::Start),
            InstanceMethod("stop",           &EngineWrapper::Stop),
            InstanceMethod("onSnapshot",     &EngineWrapper::OnSnapshot),
            InstanceMethod("onSignal",       &EngineWrapper::OnSignal),
            InstanceMethod("onMetrics",      &EngineWrapper::OnMetrics),
        });
        exports.Set("AnalyticsEngine", func);
        return exports;
    }

    EngineWrapper(const Napi::CallbackInfo& info)
        : Napi::ObjectWrap<EngineWrapper>(info) {
        Napi::Env env = info.Env();
        int threads = info.Length() > 0 ? info[0].As<Napi::Number>().Int32Value() : 8;
        engine_ = std::make_unique<AnalyticsEngine>(threads);
    }

    ~EngineWrapper() {
        if (engine_) engine_->stop();
        if (tsfn_snapshot_) tsfn_snapshot_.Release();
        if (tsfn_signal_)   tsfn_signal_.Release();
        if (tsfn_metrics_)  tsfn_metrics_.Release();
    }

private:
    // addSymbol(symbol: string)
    Napi::Value AddSymbol(const Napi::CallbackInfo& info) {
        std::string sym = info[0].As<Napi::String>();
        engine_->add_symbol(sym);
        return info.Env().Undefined();
    }

    // ingestTick({ symbol, price, volume, timestamp_us, side })
    Napi::Value IngestTick(const Napi::CallbackInfo& info) {
        Napi::Object obj = info[0].As<Napi::Object>();
        PriceTick tick{};
        std::string sym = obj.Get("symbol").As<Napi::String>();
        std::strncpy(tick.symbol, sym.c_str(), 7);
        tick.price        = obj.Get("price").As<Napi::Number>().DoubleValue();
        tick.volume       = obj.Get("volume").As<Napi::Number>().DoubleValue();
        tick.timestamp_us = obj.Get("timestamp_us").As<Napi::Number>().Int64Value();
        tick.side         = (uint8_t)obj.Get("side").As<Napi::Number>().Int32Value();
        bool ok = engine_->ingest(tick);
        return Napi::Boolean::New(info.Env(), ok);
    }

    // start()
    Napi::Value Start(const Napi::CallbackInfo& info) {
        engine_->start();
        return info.Env().Undefined();
    }

    // stop()
    Napi::Value Stop(const Napi::CallbackInfo& info) {
        engine_->stop();
        return info.Env().Undefined();
    }

    // onSnapshot(callback: (snap: SnapshotJSON) => void)
    Napi::Value OnSnapshot(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();
        Napi::Function cb = info[0].As<Napi::Function>();

        tsfn_snapshot_ = Napi::ThreadSafeFunction::New(
            env, cb, "snapshot_cb", 0, 1);

        engine_->on_snapshot([this](const IndicatorSnapshot& snap) {
            std::string json = snapshot_to_json(snap);
            tsfn_snapshot_.NonBlockingCall([json](Napi::Env env, Napi::Function cb) {
                cb.Call({ Napi::String::New(env, json) });
            });
        });
        return env.Undefined();
    }

    // onSignal(callback: (sig: SignalJSON) => void)
    Napi::Value OnSignal(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();
        Napi::Function cb = info[0].As<Napi::Function>();

        tsfn_signal_ = Napi::ThreadSafeFunction::New(
            env, cb, "signal_cb", 0, 1);

        engine_->on_signal([this](const TradingSignal& sig) {
            std::string json = signal_to_json(sig);
            tsfn_signal_.NonBlockingCall([json](Napi::Env env, Napi::Function cb) {
                cb.Call({ Napi::String::New(env, json) });
            });
        });
        return env.Undefined();
    }

    // onMetrics(callback: (m: MetricsJSON) => void)
    Napi::Value OnMetrics(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();
        Napi::Function cb = info[0].As<Napi::Function>();

        tsfn_metrics_ = Napi::ThreadSafeFunction::New(
            env, cb, "metrics_cb", 0, 1);

        engine_->on_metrics([this](const SystemMetrics& m) {
            std::string json = metrics_to_json(m);
            tsfn_metrics_.NonBlockingCall([json](Napi::Env env, Napi::Function cb) {
                cb.Call({ Napi::String::New(env, json) });
            });
        });
        return env.Undefined();
    }

    // ── JSON serializers ─────────────────────────────────────────────────
    static std::string snapshot_to_json(const IndicatorSnapshot& s) {
        char buf[1024];
        std::snprintf(buf, sizeof(buf),
            R"({"symbol":"%s","price":%.4f,"vwap":%.4f,)"
            R"("rsi":%.2f,"macd_line":%.4f,"macd_signal":%.4f,"macd_hist":%.4f,)"
            R"("bb_upper":%.4f,"bb_mid":%.4f,"bb_lower":%.4f,"bb_width":%.6f,)"
            R"("ema9":%.4f,"ema20":%.4f,"ema50":%.4f,"ema200":%.4f,)"
            R"("volume_24h":%.2f,"tick_count":%u,"timestamp_us":%lld})",
            s.symbol, s.price, s.vwap,
            s.rsi, s.macd_line, s.macd_signal, s.macd_histogram,
            s.bb_upper, s.bb_mid, s.bb_lower, s.bb_width,
            s.ema9, s.ema20, s.ema50, s.ema200,
            s.volume_24h, s.tick_count, (long long)s.timestamp_us);
        return buf;
    }

    static std::string signal_to_json(const TradingSignal& s) {
        const char* type_str =
            s.type == SignalType::BUY  ? "BUY"  :
            s.type == SignalType::SELL ? "SELL" :
            s.type == SignalType::ALERT? "ALERT": "NONE";
        char buf[512];
        std::snprintf(buf, sizeof(buf),
            R"({"symbol":"%s","type":"%s","price":%.4f,)"
            R"("confidence":%.3f,"reason":"%s","timestamp_us":%lld})",
            s.symbol, type_str, s.price,
            s.confidence, s.reason, (long long)s.timestamp_us);
        return buf;
    }

    static std::string metrics_to_json(const SystemMetrics& m) {
        char buf[512];
        std::snprintf(buf, sizeof(buf),
            R"({"avg_latency_us":%.2f,"p99_latency_us":%.2f,"p999_latency_us":%.2f,)"
            R"("ticks_processed":%llu,"ticks_dropped":%llu,)"
            R"("active_threads":%u,"queue_depth":%u})",
            m.avg_latency_us, m.p99_latency_us, m.p999_latency_us,
            (unsigned long long)m.ticks_processed,
            (unsigned long long)m.ticks_dropped,
            m.active_threads, m.queue_depth);
        return buf;
    }

    std::unique_ptr<AnalyticsEngine>  engine_;
    Napi::ThreadSafeFunction          tsfn_snapshot_;
    Napi::ThreadSafeFunction          tsfn_signal_;
    Napi::ThreadSafeFunction          tsfn_metrics_;
};

Napi::Object RegisterModule(Napi::Env env, Napi::Object exports) {
    return EngineWrapper::Init(env, exports);
}

NODE_API_MODULE(algo_engine, RegisterModule)
