/**
 * useEngineSocket.ts
 * Socket.IO hook that connects to the Node.js bridge.
 * Returns live indicators, alerts, and connection state.
 *
 * Features:
 * - Auto-reconnect with exponential backoff (handled by Socket.IO client)
 * - Snapshot load on connect for immediate chart hydration
 * - Per-symbol indicator memoization to minimize re-renders
 */

import { useEffect, useRef, useCallback, useReducer } from 'react';
import { io, Socket } from 'socket.io-client';
import type { Indicators, TradeAlert, EngineSnapshot, PricePoint } from '../types';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:3001';
const MAX_ALERTS  = 100;
const MAX_HISTORY = 200;

// ─── State ────────────────────────────────────────────────────────────────────

interface EngineState {
  connected:   boolean;
  indicators:  Record<string, Indicators>;
  history:     Record<string, PricePoint[]>;
  alerts:      TradeAlert[];
  tickRate:    number;   // ticks/sec received by this client
}

type Action =
  | { type: 'CONNECTED' }
  | { type: 'DISCONNECTED' }
  | { type: 'SNAPSHOT';    payload: EngineSnapshot }
  | { type: 'INDICATORS';  payload: Record<string, Indicators> }
  | { type: 'ALERT';       payload: TradeAlert }
  | { type: 'TICK_RATE';   payload: number };

function reducer(state: EngineState, action: Action): EngineState {
  switch (action.type) {
    case 'CONNECTED':
      return { ...state, connected: true };
    case 'DISCONNECTED':
      return { ...state, connected: false };

    case 'SNAPSHOT': {
      const { indicators, history, alerts } = action.payload;
      return { ...state, indicators, history,
               alerts: alerts.slice(-MAX_ALERTS) };
    }

    case 'INDICATORS': {
      const newIndicators = { ...state.indicators, ...action.payload };
      // Append to history
      const newHistory = { ...state.history };
      for (const [sym, ind] of Object.entries(action.payload)) {
        const prev = newHistory[sym] ?? [];
        const point: PricePoint = {
          ts: ind.ts, ema_fast: ind.ema_fast, vwap: ind.vwap,
          bb_upper: ind.bb_upper, bb_lower: ind.bb_lower,
        };
        const updated = [...prev, point];
        newHistory[sym] = updated.length > MAX_HISTORY
          ? updated.slice(-MAX_HISTORY)
          : updated;
      }
      return { ...state, indicators: newIndicators, history: newHistory };
    }

    case 'ALERT': {
      const alerts = [...state.alerts, action.payload];
      return { ...state,
               alerts: alerts.length > MAX_ALERTS
                 ? alerts.slice(-MAX_ALERTS) : alerts };
    }

    case 'TICK_RATE':
      return { ...state, tickRate: action.payload };

    default:
      return state;
  }
}

const initialState: EngineState = {
  connected: false, indicators: {}, history: {}, alerts: [], tickRate: 0,
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useEngineSocket(symbols?: string[]) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const socketRef    = useRef<Socket | null>(null);
  const tickCountRef = useRef(0);
  const rateTimerRef = useRef<number | null>(null);

  const connect = useCallback(() => {
    const socket = io(BACKEND_URL, {
      transports:       ['websocket'],
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 30_000,
      reconnectionAttempts: Infinity,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      dispatch({ type: 'CONNECTED' });
      if (symbols?.length) socket.emit('subscribe', { symbols });
    });

    socket.on('disconnect', () => dispatch({ type: 'DISCONNECTED' }));

    socket.on('snapshot', (data: EngineSnapshot) => {
      dispatch({ type: 'SNAPSHOT', payload: data });
    });

    socket.on('indicators', (batch: Record<string, Indicators>) => {
      tickCountRef.current += Object.keys(batch).length;
      dispatch({ type: 'INDICATORS', payload: batch });
    });

    socket.on('alert', (alert: TradeAlert) => {
      dispatch({ type: 'ALERT', payload: alert });
    });

    // Measure tick rate every second
    rateTimerRef.current = window.setInterval(() => {
      dispatch({ type: 'TICK_RATE', payload: tickCountRef.current });
      tickCountRef.current = 0;
    }, 1_000);
  }, []);

  useEffect(() => {
    connect();
    return () => {
      socketRef.current?.disconnect();
      if (rateTimerRef.current) clearInterval(rateTimerRef.current);
    };
  }, [connect]);

  return state;
}
