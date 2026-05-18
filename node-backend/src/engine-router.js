/**
 * engine-router.js
 * Maintains in-memory state (latest indicators per symbol, alert history).
 * Fans out data to connected Socket.IO clients, filtering by subscription.
 *
 * Message coalescing: groups updates within a 16ms window (≈60fps) to avoid
 * flooding the frontend during high tick rates.
 */

import { logger } from './logger.js';

const ALERT_HISTORY_MAX = 500;
const PRICE_HISTORY_MAX = 200;  // points per symbol for chart init
const COALESCE_MS       = 16;   // ~60fps max fanout rate

export class EngineRouter {
  constructor(io) {
    this.io = io;

    // Latest indicators per symbol
    this._indicators = new Map();   // symbol → Indicators

    // Price/VWAP history per symbol (for initial chart load)
    this._priceHistory = new Map(); // symbol → [{ts, price, vwap}]

    // Alert ring buffer
    this._alerts = [];

    // Coalescing: pending updates since last flush
    this._pendingIndicators = new Map();
    this._flushTimer = null;
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  symbols() {
    return [...this._indicators.keys()];
  }

  latestIndicators(symbol) {
    return this._indicators.get(symbol) ?? null;
  }

  recentAlerts(limit = 50) {
    return this._alerts.slice(-limit);
  }

  snapshot() {
    const indicators = {};
    for (const [sym, ind] of this._indicators) indicators[sym] = ind;
    const history = {};
    for (const [sym, h] of this._priceHistory) history[sym] = h;
    return {
      indicators,
      history,
      alerts: this._alerts.slice(-50),
    };
  }

  // ── Handlers ────────────────────────────────────────────────────────────────

  handleIndicators(data) {
    const { symbol } = data;
    if (!symbol) return;

    this._indicators.set(symbol, data);

    // Append to price history
    if (!this._priceHistory.has(symbol)) {
      this._priceHistory.set(symbol, []);
    }
    const hist = this._priceHistory.get(symbol);
    hist.push({ ts: data.ts, ema_fast: data.ema_fast, vwap: data.vwap,
                bb_upper: data.bb_upper, bb_lower: data.bb_lower });
    if (hist.length > PRICE_HISTORY_MAX) hist.shift();

    // Queue for coalesced emit
    this._pendingIndicators.set(symbol, data);
    this._scheduleFlush();
  }

  handleAlert(data) {
    this._alerts.push({ ...data, received_at: Date.now() });
    if (this._alerts.length > ALERT_HISTORY_MAX) this._alerts.shift();

    // Alerts are urgent — emit immediately (not coalesced)
    this.io.emit('alert', data);
    logger.info('Alert', { symbol: data.symbol, type: data.alert_type, msg: data.message });
  }

  // ── Coalesced fanout ────────────────────────────────────────────────────────

  _scheduleFlush() {
    if (this._flushTimer) return;
    this._flushTimer = setTimeout(() => this._flush(), COALESCE_MS);
  }

  _flush() {
    this._flushTimer = null;
    if (this._pendingIndicators.size === 0) return;

    // Broadcast to all connected sockets, filtered by their subscription
    const batch = Object.fromEntries(this._pendingIndicators);
    this._pendingIndicators.clear();

    for (const [, socket] of this.io.of('/').sockets) {
      const subSymbols = socket.data.symbols;
      if (!subSymbols || subSymbols.length === 0) {
        // No filter: send everything
        socket.emit('indicators', batch);
      } else {
        // Filtered
        const filtered = {};
        for (const sym of subSymbols) {
          if (batch[sym]) filtered[sym] = batch[sym];
        }
        if (Object.keys(filtered).length > 0) {
          socket.emit('indicators', filtered);
        }
      }
    }
  }
}
