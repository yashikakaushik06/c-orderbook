// src/components/SystemMetrics.jsx
import React from 'react';

function MetricRow({ label, value, highlight }) {
    return (
        <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '5px 0',
            borderBottom: '0.5px solid var(--color-border-tertiary)',
            fontSize: 12,
        }}>
            <span style={{ color: 'var(--color-text-secondary)' }}>{label}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 500, color: highlight || 'var(--color-text-primary)' }}>
                {value}
            </span>
        </div>
    );
}

export default function SystemMetrics({ metrics, connected }) {
    const statusColor = connected ? '#1D9E75' : '#D85A30';
    const statusLabel = connected ? '● Online' : '○ Reconnecting';

    return (
        <div>
            <MetricRow label="Connection"     value={statusLabel}       highlight={statusColor} />
            <MetricRow label="C++ Engine"     value="● Running"         highlight="#1D9E75" />
            <MetricRow label="Node Bridge"    value="● Connected"       highlight="#1D9E75" />
            <MetricRow
                label="Avg Latency"
                value={metrics ? `${(metrics.avg_latency_us / 1000).toFixed(3)} ms` : '—'}
                highlight="#1D9E75"
            />
            <MetricRow
                label="P99 Latency"
                value={metrics ? `${(metrics.p99_latency_us / 1000).toFixed(2)} ms` : '—'}
                highlight="#1D9E75"
            />
            <MetricRow
                label="P99.9 Latency"
                value={metrics ? `${(metrics.p999_latency_us / 1000).toFixed(2)} ms` : '—'}
            />
            <MetricRow
                label="Ticks Processed"
                value={metrics ? metrics.ticks_processed?.toLocaleString() : '—'}
            />
            <MetricRow
                label="Ticks Dropped"
                value={metrics ? metrics.ticks_dropped?.toLocaleString() : '0'}
                highlight={metrics?.ticks_dropped > 0 ? '#D85A30' : undefined}
            />
            <MetricRow
                label="Active Threads"
                value={metrics ? `${metrics.active_threads} / 8` : '—'}
            />
            <MetricRow
                label="Queue Depth"
                value={metrics ? metrics.queue_depth : '—'}
                highlight={metrics?.queue_depth > 100 ? '#BA7517' : undefined}
            />
        </div>
    );
}
