#pragma once

/*
 * ws_ingestor.h
 * Connects to a WebSocket price feed (e.g. Binance, Coinbase) and pushes
 * ticks into the AnalyticsEngine ring buffer.
 *
 * Dependencies (add to CMakeLists):
 *   - libwebsockets  (apt install libwebsockets-dev)
 *   - nlohmann/json  (header-only, included via FetchContent or apt)
 */

#include "engine.h"
#include <string>
#include <atomic>
#include <thread>
#include <functional>
#include <memory>
#include <libwebsockets.h>
#include <nlohmann/json.hpp>

namespace algo {

class WsIngestor {
public:
    struct Config {
        std::string host;         // e.g. "stream.binance.com"
        std::string path;         // e.g. "/stream?streams=btcusdt@aggTrade/ethusdt@aggTrade"
        int         port = 9443;
        bool        use_ssl = true;
        std::vector<std::string> symbols;  // e.g. {"BTCUSDT", "ETHUSDT"}
    };

    using RawTickCb = std::function<void(const Tick&)>;

    explicit WsIngestor(Config cfg, AnalyticsEngine* engine)
        : cfg_(std::move(cfg)), engine_(engine) {}

    ~WsIngestor() { stop(); }

    void start() {
        running_ = true;
        thread_ = std::thread([this] { run(); });
    }

    void stop() {
        running_ = false;
        if (thread_.joinable()) thread_.join();
    }

private:
    // libwebsockets callback (static trampoline)
    static int lws_callback(struct lws* wsi, enum lws_callback_reasons reason,
                            void* user, void* in, size_t len) {
        auto* self = static_cast<WsIngestor*>(lws_wsi_user(wsi));
        if (!self) return 0;
        return self->handle_callback(wsi, reason, in, len);
    }

    int handle_callback(struct lws* wsi, enum lws_callback_reasons reason,
                        void* in, size_t len) {
        switch (reason) {
        case LWS_CALLBACK_CLIENT_ESTABLISHED:
            lws_callback_on_writable(wsi);
            break;

        case LWS_CALLBACK_CLIENT_RECEIVE: {
            const std::string raw(static_cast<char*>(in), len);
            parse_and_ingest(raw);
            break;
        }

        case LWS_CALLBACK_CLIENT_CONNECTION_ERROR:
        case LWS_CALLBACK_CLIENT_CLOSED:
            // Reconnect after 2s
            reconnect_after_ms_ = 2000;
            break;

        default:
            break;
        }
        return 0;
    }

    // Parse Binance aggTrade JSON → Tick
    void parse_and_ingest(const std::string& raw) {
        try {
            auto j = nlohmann::json::parse(raw);
            // Binance combined stream wraps in {"stream":"...","data":{...}}
            auto data = j.contains("data") ? j["data"] : j;

            Tick tick{};
            tick.price      = std::stod(data.value("p", "0"));
            tick.volume     = std::stod(data.value("q", "0"));
            tick.timestamp_ns = static_cast<uint64_t>(
                data.value("T", 0LL)) * 1'000'000ULL;  // ms → ns

            // Symbol: strip "USDT" suffix, keep base (e.g. "BTCUSDT" → "BTC")
            std::string sym = data.value("s", "UNKNOWN");
            if (sym.size() > 4 && sym.substr(sym.size() - 4) == "USDT") {
                sym = sym.substr(0, sym.size() - 4);
            }
            std::strncpy(tick.symbol, sym.c_str(), 7);
            tick.symbol[7] = '\0';

            if (!engine_->ingest(tick)) {
                // Ring buffer full — log and drop
                // In production: increment a dropped_ticks counter
            }
        } catch (...) {
            // Malformed JSON — ignore
        }
    }

    void run() {
        lws_context_creation_info info{};
        info.port = CONTEXT_PORT_NO_LISTEN;

        static const lws_protocols protocols[] = {
            { "price-feed", lws_callback, 0, 4096, 0, nullptr, 0 },
            LWS_PROTOCOL_LIST_TERM
        };
        info.protocols = protocols;
        info.options   = LWS_SERVER_OPTION_DO_SSL_GLOBAL_INIT;

        auto* ctx = lws_create_context(&info);
        if (!ctx) return;

        while (running_) {
            lws_connect_info_params ci{};
            ci.context       = ctx;
            ci.address       = cfg_.host.c_str();
            ci.port          = cfg_.port;
            ci.path          = cfg_.path.c_str();
            ci.host          = lws_canonical_hostname(ctx);
            ci.origin        = "origin";
            ci.protocol      = protocols[0].name;
            ci.ssl_connection = cfg_.use_ssl ? LCCSCF_USE_SSL : 0;
            ci.userdata       = this;

            auto* wsi = lws_client_connect_via_info(&ci);
            (void)wsi;

            while (running_ && reconnect_after_ms_ == 0) {
                lws_service(ctx, 50);
            }

            if (reconnect_after_ms_ > 0) {
                std::this_thread::sleep_for(
                    std::chrono::milliseconds(reconnect_after_ms_));
                reconnect_after_ms_ = 0;
            }
        }

        lws_context_destroy(ctx);
    }

    Config            cfg_;
    AnalyticsEngine*  engine_;
    std::atomic<bool> running_{false};
    int               reconnect_after_ms_{0};
    std::thread       thread_;
};

} // namespace algo
