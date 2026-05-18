// src/App.jsx
import { useState, useMemo } from 'react';
import { useEngine }     from './hooks/useEngine';
import PriceChart        from './components/PriceChart';
import IndicatorPanel    from './components/IndicatorPanel';
import SignalFeed        from './components/SignalFeed';
import SystemMetricsPanel from './components/SystemMetrics';

const SYMBOLS = ['BTCUSD', 'ETHUSD', 'SOLUSD', 'BNBUSD', 'XRPUSD'];

function fmt_price(p, sym) {
    if (p == null) return '—';
    const opts = sym === 'XRPUSD'
        ? { minimumFractionDigits: 4, maximumFractionDigits: 4 }
        : { minimumFractionDigits: 2,  maximumFractionDigits: 2 };
    return '$' + p.toLocaleString(undefined, opts);
}

function MetricCard({ label, value, sub, subColor }) {
    return (
        <div style={{
            background: 'var(--color-background-secondary)',
            borderRadius: 'var(--border-radius-md)',
            padding: '12px 14px',
            minWidth: 0,
        }}>
            <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 6 }}>
                {label}
            </div>
            <div style={{ fontSize: 20, fontWeight: 500, fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)' }}>
                {value}
            </div>
            {sub && (
                <div style={{ fontSize: 11, marginTop: 3, color: subColor || 'var(--color-text-secondary)' }}>
                    {sub}
                </div>
            )}
        </div>
    );
}

function Panel({ title, children, style }) {
    return (
        <div style={{
            background: 'var(--color-background-primary)',
            border: '0.5px solid var(--color-border-tertiary)',
            borderRadius: 'var(--border-radius-lg)',
            padding: 16,
            ...style,
        }}>
            {title && (
                <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>
                    {title}
                </div>
            )}
            {children}
        </div>
    );
}

export default function App() {
    const { connected, snapshots, history, signals, metrics } = useEngine();
    const [activeSym, setActiveSym] = useState('BTCUSD');

    const activeSnap = snapshots[activeSym];
    const activeHist = history[activeSym];

    // Compute 24h change pct (mock — real impl needs prev-day close)
    const priceDelta = useMemo(() => {
        if (!activeHist || activeHist.prices.length < 2) return null;
        const first = activeHist.prices[0];
        const last  = activeHist.prices[activeHist.prices.length - 1];
        return ((last - first) / first) * 100;
    }, [activeHist]);

    const signalCount = useMemo(() => ({
        buy:  signals.filter(s => s.type === 'BUY').length,
        sell: signals.filter(s => s.type === 'SELL').length,
        alert:signals.filter(s => s.type === 'ALERT').length,
    }), [signals]);

    return (
        <div style={{ padding: '1rem 0', fontFamily: 'var(--font-sans)' }}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <div>
                    <div style={{ fontSize: 13, fontWeight: 500, letterSpacing: '0.08em', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>
                        AlgoEngine v3
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                        C++ analytics → Node.js bridge → React dashboard
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{
                        fontSize: 10, fontWeight: 500, padding: '3px 8px', borderRadius: 3,
                        background: connected ? 'rgba(29,158,117,0.12)' : 'rgba(216,90,48,0.12)',
                        color: connected ? '#0F6E56' : '#993C1D',
                        border: `0.5px solid ${connected ? 'rgba(29,158,117,0.35)' : 'rgba(216,90,48,0.35)'}`,
                        fontFamily: 'var(--font-mono)',
                    }}>
                        {connected ? '● LIVE' : '○ CONNECTING'}
                    </span>
                    <span style={{
                        fontSize: 10, padding: '3px 8px', borderRadius: 3,
                        background: 'rgba(83,74,183,0.12)', color: '#3C3489',
                        border: '0.5px solid rgba(83,74,183,0.3)',
                        fontFamily: 'var(--font-mono)',
                    }}>C++ CORE</span>
                    <span style={{
                        fontSize: 10, padding: '3px 8px', borderRadius: 3,
                        background: 'var(--color-background-secondary)',
                        color: 'var(--color-text-secondary)',
                        border: '0.5px solid var(--color-border-tertiary)',
                        fontFamily: 'var(--font-mono)',
                    }}>
                        {metrics ? `LAT: ${(metrics.avg_latency_us / 1000).toFixed(2)}ms` : 'LAT: —'}
                    </span>
                </div>
            </div>

            {/* Symbol selector */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
                {SYMBOLS.map(sym => {
                    const snap = snapshots[sym];
                    const active = sym === activeSym;
                    return (
                        <button
                            key={sym}
                            onClick={() => setActiveSym(sym)}
                            style={{
                                display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                                padding: '8px 12px',
                                borderRadius: 'var(--border-radius-md)',
                                border: active ? '1px solid var(--color-border-info)' : '0.5px solid var(--color-border-tertiary)',
                                background: active ? 'var(--color-background-info)' : 'var(--color-background-primary)',
                                cursor: 'pointer',
                                minWidth: 90,
                                transition: 'all 0.15s',
                            }}
                        >
                            <span style={{ fontSize: 11, fontWeight: 500, color: active ? 'var(--color-text-info)' : 'var(--color-text-primary)', fontFamily: 'var(--font-mono)' }}>
                                {sym.replace('USD', '')}
                            </span>
                            <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: active ? 'var(--color-text-info)' : 'var(--color-text-secondary)', marginTop: 2 }}>
                                {fmt_price(snap?.price, sym)}
                            </span>
                        </button>
                    );
                })}
            </div>

            {/* Summary metrics row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 14 }}>
                <MetricCard
                    label={activeSym}
                    value={fmt_price(activeSnap?.price, activeSym)}
                    sub={priceDelta != null ? `${priceDelta >= 0 ? '▲' : '▼'} ${Math.abs(priceDelta).toFixed(2)}%` : '—'}
                    subColor={priceDelta >= 0 ? '#1D9E75' : '#D85A30'}
                />
                <MetricCard
                    label="Buy Signals"
                    value={signalCount.buy}
                    sub="today"
                    subColor="#1D9E75"
                />
                <MetricCard
                    label="Sell Signals"
                    value={signalCount.sell}
                    sub="today"
                    subColor="#D85A30"
                />
                <MetricCard
                    label="Tick Rate"
                    value={metrics ? `${metrics.ticks_processed?.toLocaleString() ?? '—'}` : '—'}
                    sub="processed"
                />
            </div>

            {/* Main panels: chart + indicators */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 220px', gap: 12, marginBottom: 12 }}>
                <Panel title={`${activeSym} — Price & VWAP`}>
                    <PriceChart symbol={activeSym} history={activeHist} height={220} />
                </Panel>
                <Panel title="Indicators">
                    <IndicatorPanel snap={activeSnap} />
                </Panel>
            </div>

            {/* Signal feed + system metrics */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px', gap: 12 }}>
                <Panel title="Signal Feed">
                    <SignalFeed signals={signals} />
                </Panel>
                <Panel title="System Status">
                    <SystemMetricsPanel metrics={metrics} connected={connected} />
                </Panel>
            </div>

        </div>
    );
}
