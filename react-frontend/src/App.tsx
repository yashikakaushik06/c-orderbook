/**
 * App.tsx  ─  Main Dashboard
 *
 * Layout:
 *   ┌─ TopBar (status, latency, tick rate) ────────────────────────────────┐
 *   ├─ MetricCards (price, pnl, MACD, RSI) ────────────────────────────────┤
 *   ├─ AlertFeed ───────────────────────────────────────────────────────────┤
 *   ├─ [PriceChart | IndicatorPanel] ──────────────────────────────────────┤
 *   └─ [OrderBook mock | SystemStatus] ───────────────────────────────────┘
 */

import { useState, useCallback, useMemo } from 'react';
import { useEngineSocket } from './hooks/useEngineSocket';
import { PriceChart } from './components/PriceChart';
import { IndicatorPanel } from './components/IndicatorPanel';
import { AlertFeed } from './components/AlertFeed';
import type { Indicators } from './types';

const SYMBOLS = ['BTC', 'ETH', 'SOL'];

// ─── Small helpers ────────────────────────────────────────────────────────────

function badge(label: string, color: string, bg: string) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 500, letterSpacing: '.06em',
      padding: '3px 8px', borderRadius: 3,
      background: bg, color, border: `0.5px solid ${color}44`,
      fontFamily: 'var(--font-mono)',
    }}>
      {label}
    </span>
  );
}

function MetricCard({ label, value, sub, up }: {
  label: string; value: string; sub: string; up?: boolean;
}) {
  const chg = up === undefined ? undefined : up ? 'up' : 'dn';
  const col  = chg === 'up' ? '#1D9E75' : chg === 'dn' ? '#D85A30' : 'var(--color-text-secondary)';
  return (
    <div style={{
      background: 'var(--color-background-secondary)', borderRadius: 8,
      padding: '12px 14px',
    }}>
      <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)',
                    letterSpacing: '.07em', textTransform: 'uppercase', marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 500, fontFamily: 'var(--font-mono)', color: col }}>
        {value}
      </div>
      <div style={{ fontSize: 10, marginTop: 3, color: col }}>{sub}</div>
    </div>
  );
}

function Panel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: 'var(--color-background-primary)',
      border: '0.5px solid var(--color-border-tertiary)',
      borderRadius: 12, padding: 14, ...style,
    }}>
      {children}
    </div>
  );
}

function PanelHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  marginBottom: 10, fontSize: 10, color: 'var(--color-text-tertiary)',
                  letterSpacing: '.08em', textTransform: 'uppercase' }}>
      <span>{title}</span>
      {right}
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [activeSym, setActiveSym] = useState('BTC');
  const state = useEngineSocket(SYMBOLS);

  const ind: Indicators | undefined = state.indicators[activeSym];
  const history = state.history[activeSym] ?? [];

  // Derive simple price from ema_fast (proxy when we don't have raw price)
  const price = ind ? ind.ema_fast : 0;

  // Mock PnL (in a real system, this comes from a positions endpoint)
  const pnl = useMemo(() => {
    if (!ind) return { value: '+$0', pct: '0%', up: true };
    const p = (ind.macd_hist * 1200).toFixed(0);
    const up = ind.macd_hist >= 0;
    return {
      value: (up ? '+$' : '-$') + Math.abs(Number(p)).toLocaleString(),
      pct:   (up ? '▲ +' : '▼ ') + Math.abs(ind.macd_hist * 0.8).toFixed(2) + '%',
      up,
    };
  }, [ind]);

  const formatPrice = useCallback((p: number) =>
    '$' + p.toLocaleString(undefined, { maximumFractionDigits: 2 }), []);

  const latText = ind
    ? `${(ind.lat_avg_us / 1000).toFixed(2)}ms`
    : '—';

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-background-tertiary)',
                  padding: '1rem', fontFamily: 'var(--font-sans)' }}>

      {/* ── Top Bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    marginBottom: '1.25rem' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, letterSpacing: '.08em',
                        textTransform: 'uppercase', color: 'var(--color-text-secondary)' }}>
            AlgoEngine v3 — Live Dashboard
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
            C++ analytics engine → Node.js bridge → React UI
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {state.connected
            ? badge('● LIVE', '#0F6E56', '#1D9E7522')
            : badge('○ OFFLINE', '#993C1D', '#D85A3022')}
          {badge('C++ CORE', '#3C3489', '#534AB722')}
          {badge(`LAT ${latText}`, '#5F5E5A', 'var(--color-background-secondary)')}
          {badge(`${state.tickRate}/s`, '#185FA5', '#378ADD18')}
        </div>
      </div>

      {/* ── Metric Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: 10, marginBottom: '1.25rem' }}>
        <MetricCard
          label={`${activeSym}/USD`}
          value={ind ? formatPrice(price) : '—'}
          sub={ind ? (ind.ema_fast > ind.ema_slow ? '▲ bull trend' : '▼ bear trend') : ''}
          up={ind ? ind.ema_fast > ind.ema_slow : undefined}
        />
        <MetricCard
          label="RSI (14)"
          value={ind ? ind.rsi.toFixed(1) : '—'}
          sub={ind ? (ind.rsi > 70 ? 'Overbought' : ind.rsi < 30 ? 'Oversold' : 'Neutral') : ''}
          up={ind ? ind.rsi < 70 : undefined}
        />
        <MetricCard
          label="MACD Hist"
          value={ind ? (ind.macd_hist >= 0 ? '+' : '') + ind.macd_hist.toFixed(3) : '—'}
          sub={ind ? (ind.macd_hist > 0 ? '▲ bullish momentum' : '▼ bearish') : ''}
          up={ind ? ind.macd_hist > 0 : undefined}
        />
        <MetricCard label="PnL Today" value={pnl.value} sub={pnl.pct} up={pnl.up} />
      </div>

      {/* ── Alerts ── */}
      <Panel style={{ marginBottom: 12 }}>
        <PanelHeader
          title="Trend Alerts"
          right={<span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
            {state.alerts.length} total
          </span>}
        />
        <AlertFeed alerts={state.alerts} maxVisible={5} />
      </Panel>

      {/* ── Chart + Indicators ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 220px',
                    gap: 12, marginBottom: 12 }}>
        <Panel>
          <PanelHeader
            title="Price · EMA · VWAP · Bollinger"
            right={
              <div style={{ display: 'flex', gap: 6 }}>
                {SYMBOLS.map(sym => (
                  <button
                    key={sym}
                    onClick={() => setActiveSym(sym)}
                    style={{
                      fontSize: 10, padding: '3px 8px', borderRadius: 3,
                      border: '0.5px solid var(--color-border-tertiary)',
                      background: activeSym === sym
                        ? 'var(--color-background-secondary)' : 'transparent',
                      color: 'var(--color-text-secondary)',
                      cursor: 'pointer', fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {sym}
                  </button>
                ))}
              </div>
            }
          />
          <PriceChart symbol={activeSym} history={history} height={220} />
          {/* Chart legend */}
          <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 10,
                        color: 'var(--color-text-tertiary)' }}>
            {[
              { color: '#1D9E75', label: 'EMA(12)' },
              { color: '#534AB7', dash: true, label: 'VWAP' },
              { color: '#BA7517', dash: true, label: 'BB Bands' },
            ].map(({ color, dash, label }) => (
              <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{
                  display: 'inline-block', width: 16, height: 0,
                  borderTop: `2px ${dash ? 'dashed' : 'solid'} ${color}`,
                }} />
                {label}
              </span>
            ))}
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Indicators" />
          {ind
            ? <IndicatorPanel ind={ind} />
            : <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)',
                             textAlign: 'center', padding: '2rem 0' }}>
                Waiting for data...
              </div>
          }
        </Panel>
      </div>

      {/* ── System Status ── */}
      <Panel>
        <PanelHeader title="System Status" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0 2rem' }}>
          {[
            { label: 'C++ Engine',     value: '● Running',  ok: true },
            { label: 'Node.js Bridge', value: state.connected ? '● Connected' : '○ Offline', ok: state.connected },
            { label: 'WebSocket',      value: state.connected ? '● Streaming' : '○ Connecting', ok: state.connected },
            { label: 'Railway Deploy', value: '● prod-v3',  ok: true },
            { label: 'Vercel CDN',     value: '● Edge',     ok: true },
            { label: 'Tick Rate',      value: `${state.tickRate.toLocaleString()}/s`, ok: true },
            { label: 'Connected Clients', value: '—', ok: true },
            { label: 'Symbols Tracked', value: SYMBOLS.join(', '), ok: true },
          ].map(({ label, value, ok }) => (
            <div key={label} style={{
              display: 'flex', justifyContent: 'space-between',
              padding: '5px 0',
              borderBottom: '0.5px solid var(--color-border-tertiary)',
              fontSize: 11,
            }}>
              <span style={{ color: 'var(--color-text-secondary)' }}>{label}</span>
              <span style={{ color: ok ? '#1D9E75' : '#D85A30', fontWeight: 500,
                              fontFamily: 'var(--font-mono)' }}>{value}</span>
            </div>
          ))}
        </div>
      </Panel>

    </div>
  );
}
