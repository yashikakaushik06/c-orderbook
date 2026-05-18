// src/hooks/useEngine.js
// Manages Socket.IO connection to the Node.js bridge.
// Returns live snapshots, signals, metrics, and connection status.

import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001';

// Keep a rolling price history per symbol for charts
const HISTORY_LEN = 120;

function makeHistory() {
    return { prices: [], vwaps: [], timestamps: [] };
}

export function useEngine() {
    const socketRef = useRef(null);

    const [connected,  setConnected]  = useState(false);
    const [snapshots,  setSnapshots]  = useState({});   // { BTCUSD: IndicatorSnapshot }
    const [history,    setHistory]    = useState({});   // { BTCUSD: { prices[], vwaps[], timestamps[] } }
    const [signals,    setSignals]    = useState([]);   // TradingSignal[]  (last 50)
    const [metrics,    setMetrics]    = useState(null); // SystemMetrics

    useEffect(() => {
        const socket = io(BACKEND_URL, {
            transports: ['websocket', 'polling'],
            reconnectionDelay: 1000,
            reconnectionDelayMax: 10000,
        });

        socketRef.current = socket;

        socket.on('connect',    () => setConnected(true));
        socket.on('disconnect', () => setConnected(false));

        socket.on('snapshot', (snap) => {
            setSnapshots(prev => ({ ...prev, [snap.symbol]: snap }));

            setHistory(prev => {
                const h = prev[snap.symbol] || makeHistory();
                const prices     = [...h.prices,     snap.price].slice(-HISTORY_LEN);
                const vwaps      = [...h.vwaps,      snap.vwap].slice(-HISTORY_LEN);
                const timestamps = [...h.timestamps, snap.timestamp_us].slice(-HISTORY_LEN);
                return { ...prev, [snap.symbol]: { prices, vwaps, timestamps } };
            });
        });

        socket.on('signal', (sig) => {
            setSignals(prev => [sig, ...prev].slice(0, 50));
        });

        socket.on('metrics', (m) => {
            setMetrics(m);
        });

        return () => {
            socket.removeAllListeners();
            socket.disconnect();
        };
    }, []);

    const subscribe = useCallback((symbols) => {
        socketRef.current?.emit('subscribe', symbols);
    }, []);

    return { connected, snapshots, history, signals, metrics, subscribe };
}
