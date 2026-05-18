// src/components/SignalFeed.jsx
import React from 'react';

const TYPE_STYLES = {
    BUY:   { bg: 'rgba(29,158,117,0.1)',  border: 'rgba(29,158,117,0.3)',  color: '#0F6E56',  dot: '#1D9E75',  label: 'BUY'   },
    SELL:  { bg: 'rgba(216,90,48,0.1)',   border: 'rgba(216,90,48,0.3)',   color: '#993C1D',  dot: '#D85A30',  label: 'SELL'  },
    ALERT: { bg: 'rgba(186,117,23,0.1)',  border: 'rgba(186,117,23,0.3)',  color: '#854F0B',  dot: '#BA7517',  label: 'ALERT' },
    NONE:  { bg: 'rgba(128,128,128,0.1)', border: 'rgba(128,128,128,0.3)', color: '#666',     dot: '#888',     label: '—'     },
};

function ts_label(ts_us) {
    if (!ts_us) return '';
    const d = new Date(ts_us / 1000);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function SignalRow({ sig }) {
    const style = TYPE_STYLES[sig.type] || TYPE_STYLES.NONE;
    const confPct = sig.confidence != null ? Math.round(sig.confidence * 100) : null;

    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '7px 10px',
            background: style.bg,
            border: `0.5px solid ${style.border}`,
            borderRadius: 6,
            marginBottom: 6,
            fontSize: 12,
        }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: style.dot, flexShrink: 0 }} />
            <span style={{ fontWeight: 500, color: style.color, minWidth: 36, fontFamily: 'var(--font-mono)' }}>
                {style.label}
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)', fontWeight: 500 }}>
                {sig.symbol}
            </span>
            <span style={{ color: 'var(--color-text-secondary)', flex: 1 }}>
                {sig.reason}
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                ${sig.price?.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </span>
            {confPct !== null && (
                <span style={{ color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap' }}>
                    {confPct}%
                </span>
            )}
            <span style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: 10, whiteSpace: 'nowrap' }}>
                {ts_label(sig.timestamp_us)}
            </span>
        </div>
    );
}

export default function SignalFeed({ signals }) {
    if (!signals || signals.length === 0) {
        return (
            <div style={{ padding: '1rem 0', color: 'var(--color-text-tertiary)', fontSize: 13 }}>
                No signals yet — engine warming up…
            </div>
        );
    }

    return (
        <div style={{ maxHeight: 280, overflowY: 'auto' }}>
            {signals.map((sig, i) => (
                <SignalRow key={`${sig.symbol}-${sig.timestamp_us}-${i}`} sig={sig} />
            ))}
        </div>
    );
}
