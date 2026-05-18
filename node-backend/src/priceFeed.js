// src/priceFeed.js
// Connects to Binance WebSocket streams and ingests ticks into the C++ engine.
// Supports BTC, ETH, SOL, BNB, XRP by default.

const WebSocket = require('ws');

const SYMBOLS = ['btcusdt', 'ethusdt', 'solusdt', 'bnbusdt', 'xrpusdt'];
const WS_BASE  = 'wss://stream.binance.com:9443/stream?streams=';

class PriceFeed {
    constructor(engine, io) {
        this.engine    = engine;    // AnalyticsEngine native addon
        this.io        = io;        // Socket.IO server (for raw tick fan-out)
        this.ws        = null;
        this.reconnect_delay = 1000;
        this.tick_count = 0;
        this.tick_rate  = 0;
        this._rate_ts   = Date.now();
        this._rate_count = 0;
    }

    start() {
        // Register symbols with C++ engine
        for (const sym of SYMBOLS) {
            this.engine.addSymbol(sym.toUpperCase().replace('USDT', '') + 'USD');
        }

        const streams = SYMBOLS.map(s => `${s}@aggTrade`).join('/');
        const url = WS_BASE + streams;

        console.log('[PriceFeed] Connecting to Binance streams...');
        this._connect(url);
    }

    _connect(url) {
        this.ws = new WebSocket(url);

        this.ws.on('open', () => {
            console.log('[PriceFeed] Connected to Binance WebSocket');
            this.reconnect_delay = 1000;
        });

        this.ws.on('message', (data) => {
            try {
                this._handle_message(JSON.parse(data));
            } catch (e) {
                console.error('[PriceFeed] Parse error:', e.message);
            }
        });

        this.ws.on('close', (code) => {
            console.warn(`[PriceFeed] Disconnected (${code}). Reconnecting in ${this.reconnect_delay}ms`);
            setTimeout(() => {
                this.reconnect_delay = Math.min(this.reconnect_delay * 2, 30000);
                this._connect(url);
            }, this.reconnect_delay);
        });

        this.ws.on('error', (err) => {
            console.error('[PriceFeed] WebSocket error:', err.message);
        });
    }

    _handle_message(msg) {
        // Binance aggTrade stream shape
        const data = msg.data || msg;
        if (!data || !data.s) return;

        const symbol = this._normalize_symbol(data.s);
        const price  = parseFloat(data.p);
        const volume = parseFloat(data.q);
        const ts_us  = (data.T || Date.now()) * 1000; // ms → µs
        const side   = data.m ? 1 : 0; // maker = sell side

        // Ingest into C++ engine
        this.engine.ingestTick({ symbol, price, volume, timestamp_us: ts_us, side });

        // Tick rate tracking
        this._rate_count++;
        this.tick_count++;
        const now = Date.now();
        if (now - this._rate_ts >= 1000) {
            this.tick_rate = this._rate_count;
            this._rate_count = 0;
            this._rate_ts = now;
        }

        // Fan out raw tick to Socket.IO (lightweight — just price + symbol)
        if (this.io) {
            this.io.emit('tick', { symbol, price, volume, ts: data.T });
        }
    }

    _normalize_symbol(binance_sym) {
        // "BTCUSDT" → "BTCUSD\0" (7 chars + null for C struct)
        return binance_sym.replace('USDT', 'USD').substring(0, 7);
    }

    get_stats() {
        return {
            tick_count: this.tick_count,
            tick_rate:  this.tick_rate,
            connected:  this.ws && this.ws.readyState === WebSocket.OPEN
        };
    }

    stop() {
        if (this.ws) {
            this.ws.removeAllListeners();
            this.ws.close();
        }
    }
}

module.exports = PriceFeed;
