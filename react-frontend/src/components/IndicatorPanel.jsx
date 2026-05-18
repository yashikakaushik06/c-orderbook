// src/components/IndicatorPanel.jsx
import React from 'react';

function IndicatorBar({ value, min = 0, max = 100, color }) {
    const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
    return (
        <div style={{ height: 3, background: 'rgba(128,128,128,0.15)', borderRadius: 2, marginTop: 4 }}>
            <div style={{ height: 3, width: `${pct}%`, background: color, borderRadius: 2, transition: 'width 0.3s ease' }} />
        </div>
    );
}

function Indicator({ label, value, displayValue, color, min, max, note }) {
    return (
        <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    {label}
                </span>
                {note && (
                    <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>{note}</span>
                )}
            </div>
            <div style={{ fontSize: 18, fontWeight: 500, color, fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                {displayValue ?? (typeof value === 'number' ? value.toFixed(2) : '—')}
            </div>
            {min !== undefined && (
                <IndicatorBar value={value} min={min} max={max} color={color} />
            )}
        </div>
    );
}

export default function IndicatorPanel({ snap }) {
    if (!snap) {
        return (
            <div style={{ padding: '1rem', color: 'var(--color-text-tertiary)', fontSize: 13 }}>
                Waiting for data…
            </div>
        );
    }

    const rsiColor   = snap.rsi > 70 ? '#D85A30' : snap.rsi < 30 ? '#1D9E75' : '#1D9E75';
    const macdColor  = snap.macd_hist >= 0 ? '#1D9E75' : '#D85A30';
    const emaSignal  = snap.ema9 > snap.ema20 ? 'bullish' : 'bearish';
    const emaColor   = snap.ema9 > snap.ema20 ? '#1D9E75' : '#D85A30';

    return (
        <div>
            <Indicator
                label="RSI (14)"
                value={snap.rsi}
                color={rsiColor}
                min={0} max={100}
                note={snap.rsi > 70 ? 'overbought' : snap.rsi < 30 ? 'oversold' : 'neutral'}
            />
            <Indicator
                label="MACD (12,26,9)"
                value={snap.macd_hist}
                displayValue={(snap.macd_hist >= 0 ? '+' : '') + snap.macd_hist?.toFixed(4)}
                color={macdColor}
                min={-50} max={50}
            />
            <Indicator
                label="MACD Signal"
                value={snap.macd_signal}
                displayValue={snap.macd_signal?.toFixed(4)}
                color="var(--color-text-secondary)"
            />
            <Indicator
                label="Bollinger Width"
                value={snap.bb_width}
                displayValue={snap.bb_width?.toFixed(5)}
                color="#BA7517"
                min={0} max={0.1}
                note={snap.bb_width < 0.02 ? 'squeeze' : 'normal'}
            />
            <Indicator
                label="EMA 9 / EMA 20"
                value={snap.ema9 - snap.ema20}
                displayValue={`↑ ${emaSignal}`}
                color={emaColor}
                min={-100} max={100}
            />
            <Indicator
                label="VWAP"
                value={snap.vwap}
                displayValue={'$' + snap.vwap?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                color="var(--color-text-primary)"
            />
            <Indicator
                label="BB Upper"
                value={snap.bb_upper}
                displayValue={'$' + snap.bb_upper?.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                color="var(--color-text-secondary)"
            />
            <Indicator
                label="BB Lower"
                value={snap.bb_lower}
                displayValue={'$' + snap.bb_lower?.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                color="var(--color-text-secondary)"
            />
        </div>
    );
}
