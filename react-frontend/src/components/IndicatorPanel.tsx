/**
 * IndicatorPanel.tsx
 * Displays RSI, MACD, Bollinger Width, EMA cross, Volume
 * with animated bar fills and color-coded signal states.
 */

import { useMemo } from 'react';
import type { Indicators } from '../types';

interface IndicatorPanelProps {
  ind: Indicators;
}

interface IndicatorRowProps {
  label:   string;
  value:   string;
  pct:     number;      // 0–100 fill for bar
  color:   string;
  signal?: 'bull' | 'bear' | 'neutral';
}

function IndicatorRow({ label, value, pct, color, signal }: IndicatorRowProps) {
  const textColor =
    signal === 'bull'   ? 'var(--color-text-success)' :
    signal === 'bear'   ? 'var(--color-text-danger)'  :
                          'var(--color-text-primary)';

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between',
                    alignItems: 'baseline', marginBottom: 4 }}>
        <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)',
                       letterSpacing: '.07em', textTransform: 'uppercase' }}>
          {label}
        </span>
        <span style={{ fontSize: 15, fontWeight: 500, fontFamily: 'var(--font-mono)',
                       color: textColor }}>
          {value}
        </span>
      </div>
      <div style={{ height: 3, background: 'var(--color-border-tertiary)',
                    borderRadius: 2, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${Math.max(0, Math.min(100, pct))}%`,
          background: color, borderRadius: 2,
          transition: 'width 0.4s ease',
        }} />
      </div>
    </div>
  );
}

export function IndicatorPanel({ ind }: IndicatorPanelProps) {
  const rows = useMemo(() => {
    const rsiPct    = ind.rsi;
    const rsiSig    = ind.rsi > 70 ? 'bear' : ind.rsi < 30 ? 'bull' : 'neutral';
    const macdPct   = Math.min(100, Math.max(0, 50 + ind.macd_hist * 5));
    const macdSig   = ind.macd_hist > 0 ? 'bull' : 'bear';
    const bbPct     = Math.min(100, ind.bb_width * 1000);
    const emaBull   = ind.ema_fast > ind.ema_slow;
    const latAvgMs  = (ind.lat_avg_us / 1000).toFixed(3);
    const latP99Ms  = (ind.lat_p99_us / 1000).toFixed(2);
    const latPct    = Math.min(100, ind.lat_avg_us / 5);  // 5µs = 100%

    return [
      {
        label: 'RSI (14)',
        value: rsiPct.toFixed(1),
        pct:   rsiPct,
        color: rsiSig === 'bear' ? '#D85A30' : rsiSig === 'bull' ? '#1D9E75' : '#534AB7',
        signal: rsiSig as 'bull' | 'bear' | 'neutral',
      },
      {
        label: 'MACD Histogram',
        value: (ind.macd_hist >= 0 ? '+' : '') + ind.macd_hist.toFixed(2),
        pct:   macdPct,
        color: macdSig === 'bull' ? '#1D9E75' : '#D85A30',
        signal: macdSig,
      },
      {
        label: 'Bollinger Width',
        value: ind.bb_width.toFixed(4),
        pct:   bbPct,
        color: '#BA7517',
        signal: 'neutral' as const,
      },
      {
        label: 'EMA 12 / 26',
        value: emaBull ? '↑ bullish' : '↓ bearish',
        pct:   emaBull ? 75 : 25,
        color: emaBull ? '#1D9E75' : '#D85A30',
        signal: emaBull ? 'bull' : 'bear',
      },
      {
        label: 'Avg Latency',
        value: `${latAvgMs}ms`,
        pct:   latPct,
        color: '#534AB7',
        signal: 'neutral' as const,
      },
      {
        label: 'P99 Latency',
        value: `${latP99Ms}ms`,
        pct:   Math.min(100, ind.lat_p99_us / 20),
        color: '#888780',
        signal: 'neutral' as const,
      },
    ];
  }, [ind]);

  return (
    <div>
      {rows.map(row => (
        <IndicatorRow key={row.label} {...row} />
      ))}
      <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)',
                    marginTop: 8, paddingTop: 8,
                    borderTop: '0.5px solid var(--color-border-tertiary)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>VWAP</span>
          <span style={{ fontFamily: 'var(--font-mono)' }}>
            ${ind.vwap.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
          <span>Vol 24h</span>
          <span style={{ fontFamily: 'var(--font-mono)' }}>
            ${(ind.volume_24h / 1e9).toFixed(2)}B
          </span>
        </div>
      </div>
    </div>
  );
}
