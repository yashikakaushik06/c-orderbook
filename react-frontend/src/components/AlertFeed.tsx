/**
 * AlertFeed.tsx
 * Scrolling list of real-time trading alerts from the C++ engine.
 * Auto-scrolls to newest. Color-coded by type.
 */

import { useEffect, useRef } from 'react';
import type { TradeAlert } from '../types';

interface AlertFeedProps {
  alerts: TradeAlert[];
  maxVisible?: number;
}

const ALERT_STYLES: Record<string, { bg: string; border: string; dot: string; text: string }> = {
  buy: {
    bg:     'rgba(29,158,117,0.07)',
    border: 'rgba(29,158,117,0.3)',
    dot:    '#1D9E75',
    text:   '#0F6E56',
  },
  sell: {
    bg:     'rgba(216,90,48,0.07)',
    border: 'rgba(216,90,48,0.3)',
    dot:    '#D85A30',
    text:   '#993C1D',
  },
  warning: {
    bg:     'rgba(186,117,23,0.07)',
    border: 'rgba(186,117,23,0.3)',
    dot:    '#BA7517',
    text:   '#854F0B',
  },
  info: {
    bg:     'var(--color-background-secondary)',
    border: 'var(--color-border-tertiary)',
    dot:    '#888780',
    text:   'var(--color-text-secondary)',
  },
};

function formatTime(ts_ns: number): string {
  return new Date(Math.floor(ts_ns / 1_000_000))
    .toLocaleTimeString([], { hour12: false });
}

export function AlertFeed({ alerts, maxVisible = 6 }: AlertFeedProps) {
  const listRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new alerts
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [alerts]);

  const visible = alerts.slice(-maxVisible);

  return (
    <div
      ref={listRef}
      style={{
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        maxHeight: 180,
      }}
    >
      {visible.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)',
                      textAlign: 'center', padding: '1rem 0' }}>
          No alerts yet
        </div>
      )}
      {visible.map((a, i) => {
        const style = ALERT_STYLES[a.alert_type] ?? ALERT_STYLES.info;
        return (
          <div
            key={`${a.ts}-${i}`}
            style={{
              display:      'flex',
              alignItems:   'flex-start',
              gap:          8,
              padding:      '7px 10px',
              borderRadius: 6,
              border:       `0.5px solid ${style.border}`,
              background:   style.bg,
              animation:    'fadeIn .3s ease',
            }}
          >
            <div style={{
              width: 6, height: 6, borderRadius: '50%',
              background: style.dot, flexShrink: 0, marginTop: 5,
            }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, color: style.text, fontWeight: 500,
                             overflow: 'hidden', textOverflow: 'ellipsis',
                             whiteSpace: 'nowrap' }}>
                {a.message}
              </div>
              <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)',
                             marginTop: 2 }}>
                {a.symbol} · ${a.price.toLocaleString(undefined, { maximumFractionDigits: 2 })} · {formatTime(a.ts)}
              </div>
            </div>
          </div>
        );
      })}
      <style>{`@keyframes fadeIn { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:none} }`}</style>
    </div>
  );
}
