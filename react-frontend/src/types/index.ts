// types/index.ts  ─  Shared TypeScript types

export interface Indicators {
  symbol:      string;
  ts:          number;
  rsi:         number;
  macd:        number;
  macd_signal: number;
  macd_hist:   number;
  ema_fast:    number;
  ema_slow:    number;
  bb_upper:    number;
  bb_middle:   number;
  bb_lower:    number;
  bb_width:    number;
  vwap:        number;
  volume_24h:  number;
  lat_avg_us:  number;
  lat_p99_us:  number;
}

export type AlertType = 'buy' | 'sell' | 'warning' | 'info';

export interface TradeAlert {
  symbol:      string;
  ts:          number;
  price:       number;
  message:     string;
  alert_type:  AlertType;
  received_at: number;
}

export interface PricePoint {
  ts:       number;
  ema_fast: number;
  vwap:     number;
  bb_upper: number;
  bb_lower: number;
}

export interface EngineSnapshot {
  indicators: Record<string, Indicators>;
  history:    Record<string, PricePoint[]>;
  alerts:     TradeAlert[];
}

export interface SystemStatus {
  ipc_connected: boolean;
  uptime_s:      number;
  clients:       number;
  symbols:       string[];
}
