// src/mockEngine.js
// Pure-JS mock of the native AnalyticsEngine for local dev / CI.
// Simulates realistic indicator values with noise.

'use strict';

class MockEngine {
    constructor(threads = 8) {
        this.threads     = threads;
        this.symbols     = new Set();
        this.states      = {};
        this._snapCb     = null;
        this._sigCb      = null;
        this._metricsCb  = null;
        this._interval   = null;
        this._tickCount  = 0;
    }

    addSymbol(sym) {
        this.symbols.add(sym);
        this.states[sym] = {
            price:   sym.startsWith('BTC') ? 67500 : sym.startsWith('ETH') ? 3500 : 145,
            rsi:     50, macd: 0, macd_sig: 0, bb_w: 0.03, ema9: 0, ema20: 0
        };
    }

    ingestTick(tick) {
        this._tickCount++;
        return true;
    }

    onSnapshot(cb) { this._snapCb = cb; }
    onSignal(cb)   { this._sigCb  = cb; }
    onMetrics(cb)  { this._metricsCb = cb; }

    start() {
        // Emit snapshots at ~2 Hz per symbol
        this._interval = setInterval(() => {
            for (const sym of this.symbols) {
                this._tick(sym);
            }
        }, 500);

        // Metrics every 1s
        this._mInterval = setInterval(() => {
            if (this._metricsCb) {
                this._metricsCb(JSON.stringify({
                    avg_latency_us:  280 + Math.random() * 100,
                    p99_latency_us:  900 + Math.random() * 400,
                    p999_latency_us: 1800 + Math.random() * 600,
                    ticks_processed: this._tickCount,
                    ticks_dropped:   0,
                    active_threads:  this.threads,
                    queue_depth:     Math.floor(Math.random() * 20)
                }));
            }
        }, 1000);
    }

    stop() {
        clearInterval(this._interval);
        clearInterval(this._mInterval);
    }

    _tick(sym) {
        const s = this.states[sym];
        const drift = (Math.random() - 0.488) * s.price * 0.0012;
        s.price += drift;
        s.rsi    = Math.max(15, Math.min(85, s.rsi + (Math.random() - 0.5) * 3));
        s.macd   = s.macd + (Math.random() - 0.5) * 1.5;
        s.macd_sig = s.macd_sig * 0.85 + s.macd * 0.15;
        s.bb_w   = Math.max(0.01, Math.min(0.08, s.bb_w + (Math.random() - 0.5) * 0.003));

        const snap = {
            symbol: sym, price: +s.price.toFixed(2),
            vwap: +(s.price * 1.0003).toFixed(2),
            rsi: +s.rsi.toFixed(2),
            macd_line: +s.macd.toFixed(4), macd_signal: +s.macd_sig.toFixed(4),
            macd_hist: +(s.macd - s.macd_sig).toFixed(4),
            bb_upper: +(s.price * (1 + s.bb_w)).toFixed(2),
            bb_mid:   +(s.price).toFixed(2),
            bb_lower: +(s.price * (1 - s.bb_w)).toFixed(2),
            bb_width: +s.bb_w.toFixed(5),
            ema9: +(s.price * 0.998).toFixed(2),
            ema20: +(s.price * 0.995).toFixed(2),
            ema50: +(s.price * 0.990).toFixed(2),
            ema200: +(s.price * 0.975).toFixed(2),
            volume_24h: 2400000000,
            tick_count: this._tickCount,
            timestamp_us: Date.now() * 1000
        };

        if (this._snapCb) this._snapCb(JSON.stringify(snap));

        // Occasionally generate a signal
        if (Math.random() < 0.015 && this._sigCb) {
            const types = ['BUY', 'SELL', 'ALERT'];
            const reasons = [
                'MACD bullish crossover', 'RSI oversold reversal',
                'EMA golden cross', 'Bollinger squeeze breakout',
                'RSI overbought reversal'
            ];
            this._sigCb(JSON.stringify({
                symbol: sym, type: types[Math.floor(Math.random() * 3)],
                price: +s.price.toFixed(2),
                confidence: +(0.55 + Math.random() * 0.3).toFixed(2),
                reason: reasons[Math.floor(Math.random() * reasons.length)],
                timestamp_us: Date.now() * 1000
            }));
        }
    }
}

module.exports = MockEngine;
