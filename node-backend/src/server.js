// src/server.js
// Node.js bridge: C++ AnalyticsEngine ↔ React frontend via Socket.IO
'use strict';

const path       = require('path');
const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const cors       = require('cors');

// ── Load native C++ addon (falls back to JS mock if not compiled) ─────────
let Engine;
try {
    Engine = require(path.join(__dirname, '../build/Release/algo_engine')).AnalyticsEngine;
    console.log('[Server] Native C++ engine loaded');
} catch (err) {
    console.warn('[Server] Native addon not found — using JS mock engine');
    Engine = require('./mockEngine');
}

const PriceFeed = require('./priceFeed');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
    cors: { origin: process.env.FRONTEND_URL || '*', methods: ['GET','POST'] },
    transports: ['websocket', 'polling']
});

app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.json());

// ── Engine ────────────────────────────────────────────────────────────────
const NUM_THREADS   = parseInt(process.env.ENGINE_THREADS || '8', 10);
const engine        = new Engine(NUM_THREADS);
const snapshotCache = new Map();
const signalBuffer  = [];
const MAX_SIGNALS   = 100;
let   lastMetrics   = null;

engine.onSnapshot((jsonStr) => {
    const snap = JSON.parse(jsonStr);
    snapshotCache.set(snap.symbol, snap);
    io.emit('snapshot', snap);
});

engine.onSignal((jsonStr) => {
    const sig = JSON.parse(jsonStr);
    signalBuffer.push(sig);
    if (signalBuffer.length > MAX_SIGNALS) signalBuffer.shift();
    io.emit('signal', sig);
    console.log(`[Signal] ${sig.type} ${sig.symbol} @ ${sig.price.toFixed(2)} — ${sig.reason}`);
});

engine.onMetrics((jsonStr) => {
    lastMetrics = JSON.parse(jsonStr);
    io.emit('metrics', lastMetrics);
});

// ── Price Feed ────────────────────────────────────────────────────────────
const feed = new PriceFeed(engine, io);

// ── REST ──────────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({
    status: 'ok', engine: 'running', threads: NUM_THREADS,
    feed: feed.get_stats(), metrics: lastMetrics,
    uptime_s: Math.floor(process.uptime())
}));

app.get('/api/symbols',  (req, res) => res.json({ symbols: [...snapshotCache.keys()] }));

app.get('/api/snapshot/:symbol', (req, res) => {
    const snap = snapshotCache.get(req.params.symbol.toUpperCase());
    if (!snap) return res.status(404).json({ error: 'Symbol not found' });
    res.json(snap);
});

app.get('/api/signals', (req, res) => {
    const limit = Math.min(parseInt(req.query.limit || '20', 10), MAX_SIGNALS);
    res.json({ signals: signalBuffer.slice(-limit) });
});

// ── Socket.IO ─────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
    console.log(`[IO] Connected: ${socket.id}`);
    for (const snap of snapshotCache.values()) socket.emit('snapshot', snap);
    if (lastMetrics) socket.emit('metrics', lastMetrics);
    socket.on('disconnect', () => console.log(`[IO] Disconnected: ${socket.id}`));
});

// ── Start ─────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3001', 10);
server.listen(PORT, () => {
    console.log(`[Server] Listening on :${PORT}`);
    engine.start();
    feed.start();
});

process.on('SIGTERM', () => { feed.stop(); engine.stop(); server.close(() => process.exit(0)); });
process.on('SIGINT',  () => { feed.stop(); engine.stop(); process.exit(0); });
