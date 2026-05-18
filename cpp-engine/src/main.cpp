/*
 * main.cpp  ─  AlgoEngine process entry point
 *
 * Starts:
 *   1. AnalyticsEngine   (multi-threaded indicator pipeline)
 *   2. WsIngestor        (live WebSocket price feed)
 *   3. IPC server        (Unix domain socket → Node.js bridge)
 *
 * Build:
 *   cmake -B build -DCMAKE_BUILD_TYPE=Release && cmake --build build -j$(nproc)
 *
 * Run:
 *   ./build/algo_engine --symbols BTC,ETH,SOL --threads 8
 */

#include "engine.h"
#include "ws_ingestor.h"

#include <iostream>
#include <sstream>
#include <iomanip>
#include <csignal>
#include <atomic>
#include <sys/socket.h>
#include <sys/un.h>
#include <unistd.h>
#include <fcntl.h>
#include <nlohmann/json.hpp>

// ─── IPC Server ───────────────────────────────────────────────────────────────
// Writes JSON-serialized Indicators + Alerts to a Unix domain socket.
// Node.js connects to this socket via the 'net' module.

static constexpr char SOCKET_PATH[] = "/tmp/algo_engine.sock";

static std::atomic<bool> g_running{true};

static void handle_signal(int) { g_running = false; }

// Convert Indicators → JSON string
static std::string indicators_to_json(const algo::Indicators& ind,
                                      double avg_lat_us, double p99_lat_us) {
    nlohmann::json j;
    j["type"]       = "indicators";
    j["symbol"]     = ind.symbol;
    j["ts"]         = ind.timestamp_ns;
    j["rsi"]        = std::round(ind.rsi * 100) / 100.0;
    j["macd"]       = std::round(ind.macd * 1000) / 1000.0;
    j["macd_signal"]= std::round(ind.macd_signal * 1000) / 1000.0;
    j["macd_hist"]  = std::round(ind.macd_hist * 1000) / 1000.0;
    j["ema_fast"]   = ind.ema_fast;
    j["ema_slow"]   = ind.ema_slow;
    j["bb_upper"]   = ind.bb_upper;
    j["bb_middle"]  = ind.bb_middle;
    j["bb_lower"]   = ind.bb_lower;
    j["bb_width"]   = std::round(ind.bb_width * 10000) / 10000.0;
    j["vwap"]       = ind.vwap;
    j["volume_24h"] = ind.volume_24h;
    j["lat_avg_us"] = std::round(avg_lat_us * 100) / 100.0;
    j["lat_p99_us"] = std::round(p99_lat_us * 100) / 100.0;
    return j.dump() + "\n";  // newline-delimited JSON
}

static std::string alert_to_json(const algo::Alert& a) {
    nlohmann::json j;
    j["type"]    = "alert";
    j["symbol"]  = a.symbol;
    j["ts"]      = a.timestamp_ns;
    j["price"]   = a.price;
    j["message"] = a.message;
    switch (a.type) {
        case algo::AlertType::BUY_SIGNAL:  j["alert_type"] = "buy";     break;
        case algo::AlertType::SELL_SIGNAL: j["alert_type"] = "sell";    break;
        case algo::AlertType::WARNING:     j["alert_type"] = "warning"; break;
        case algo::AlertType::INFO:        j["alert_type"] = "info";    break;
    }
    return j.dump() + "\n";
}

class IpcServer {
public:
    IpcServer() {
        ::unlink(SOCKET_PATH);
        server_fd_ = ::socket(AF_UNIX, SOCK_STREAM, 0);
        if (server_fd_ < 0) throw std::runtime_error("socket() failed");

        struct sockaddr_un addr{};
        addr.sun_family = AF_UNIX;
        std::strncpy(addr.sun_path, SOCKET_PATH, sizeof(addr.sun_path) - 1);

        if (::bind(server_fd_, (struct sockaddr*)&addr, sizeof(addr)) < 0)
            throw std::runtime_error("bind() failed");
        if (::listen(server_fd_, 5) < 0)
            throw std::runtime_error("listen() failed");

        // Non-blocking accept
        ::fcntl(server_fd_, F_SETFL, O_NONBLOCK);
    }

    ~IpcServer() {
        ::close(server_fd_);
        ::unlink(SOCKET_PATH);
        for (int fd : clients_) ::close(fd);
    }

    // Call periodically to accept new clients
    void accept_clients() {
        int fd = ::accept(server_fd_, nullptr, nullptr);
        if (fd >= 0) {
            ::fcntl(fd, F_SETFL, O_NONBLOCK);
            clients_.push_back(fd);
            std::cout << "[IPC] Client connected (fd=" << fd << ")\n";
        }
    }

    // Broadcast JSON line to all connected clients, drop dead ones
    void broadcast(const std::string& msg) {
        std::lock_guard<std::mutex> lk(mu_);
        auto it = clients_.begin();
        while (it != clients_.end()) {
            const ssize_t n = ::write(*it, msg.c_str(), msg.size());
            if (n < 0) {
                std::cout << "[IPC] Client disconnected (fd=" << *it << ")\n";
                ::close(*it);
                it = clients_.erase(it);
            } else {
                ++it;
            }
        }
    }

private:
    int                server_fd_{-1};
    std::vector<int>   clients_;
    std::mutex         mu_;
};

// ─── main ─────────────────────────────────────────────────────────────────────

int main(int argc, char** argv) {
    std::signal(SIGINT,  handle_signal);
    std::signal(SIGTERM, handle_signal);

    // ── Parse args ──────────────────────────────────────────────────────
    size_t threads = 8;
    std::vector<std::string> symbols = {"BTC", "ETH", "SOL"};

    for (int i = 1; i < argc; ++i) {
        std::string arg(argv[i]);
        if (arg == "--threads" && i + 1 < argc) {
            threads = std::stoul(argv[++i]);
        } else if (arg == "--symbols" && i + 1 < argc) {
            symbols.clear();
            std::istringstream ss(argv[++i]);
            std::string tok;
            while (std::getline(ss, tok, ',')) symbols.push_back(tok);
        }
    }

    std::cout << "[AlgoEngine] Starting with " << threads << " threads, "
              << "symbols: ";
    for (auto& s : symbols) std::cout << s << " ";
    std::cout << "\n";

    // ── IPC server ──────────────────────────────────────────────────────
    IpcServer ipc;

    // ── Analytics Engine ─────────────────────────────────────────────
    algo::AnalyticsEngine::Config eng_cfg;
    eng_cfg.thread_count = threads;
    algo::AnalyticsEngine engine(eng_cfg);

    engine.set_indicator_callback([&](const algo::Indicators& ind) {
        const std::string json = indicators_to_json(
            ind,
            engine.avg_latency_us(),
            engine.p99_latency_us()
        );
        ipc.broadcast(json);
    });

    engine.set_alert_callback([&](const algo::Alert& a) {
        ipc.broadcast(alert_to_json(a));
    });

    engine.start();

    // ── WebSocket Ingestor (Binance combined stream) ──────────────────
    // Build path: /stream?streams=btcusdt@aggTrade/ethusdt@aggTrade/...
    std::ostringstream path;
    path << "/stream?streams=";
    for (size_t i = 0; i < symbols.size(); ++i) {
        if (i > 0) path << "/";
        std::string sym = symbols[i];
        std::transform(sym.begin(), sym.end(), sym.begin(), ::tolower);
        path << sym << "usdt@aggTrade";
    }

    algo::WsIngestor::Config ws_cfg;
    ws_cfg.host    = "stream.binance.com";
    ws_cfg.path    = path.str();
    ws_cfg.port    = 9443;
    ws_cfg.use_ssl = true;
    ws_cfg.symbols = symbols;

    algo::WsIngestor ingestor(ws_cfg, &engine);
    ingestor.start();

    std::cout << "[AlgoEngine] Running. IPC socket: " << SOCKET_PATH << "\n";
    std::cout << "[AlgoEngine] Ctrl+C to stop.\n";

    // ── Main loop ────────────────────────────────────────────────────
    uint64_t last_stats = 0;
    while (g_running) {
        ipc.accept_clients();
        std::this_thread::sleep_for(std::chrono::milliseconds(50));

        // Print stats every 5 seconds
        const uint64_t now = engine.ticks_processed();
        if (now - last_stats > 5000) {
            std::cout << "[AlgoEngine] ticks=" << now
                      << " avg_lat=" << std::fixed << std::setprecision(2)
                      << engine.avg_latency_us() << "µs"
                      << " p99=" << engine.p99_latency_us() << "µs\n";
            last_stats = now;
        }
    }

    std::cout << "[AlgoEngine] Shutting down...\n";
    ingestor.stop();
    engine.stop();
    std::cout << "[AlgoEngine] Done. Total ticks: " << engine.ticks_processed() << "\n";
    return 0;
}
