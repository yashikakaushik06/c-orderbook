/**
 * PriceChart.tsx
 * Real-time EMA / VWAP / Bollinger Band chart.
 * Uses Chart.js directly (ref-based, no re-render on each tick).
 */

import { useEffect, useRef, useCallback } from 'react';
import {
  Chart,
  LineController, LineElement, PointElement,
  LinearScale, TimeScale, Filler,
  Tooltip, Legend,
} from 'chart.js';
import 'chartjs-adapter-date-fns';
import type { PricePoint } from '../types';

Chart.register(
  LineController, LineElement, PointElement,
  LinearScale, TimeScale, Filler,
  Tooltip, Legend,
);

interface PriceChartProps {
  symbol:  string;
  history: PricePoint[];
  height?: number;
}

const COLORS = {
  ema:     '#1D9E75',
  vwap:    '#534AB7',
  bbUpper: '#BA7517',
  bbLower: '#BA7517',
  bbFill:  'rgba(186,117,23,0.07)',
};

export function PriceChart({ symbol, history, height = 220 }: PriceChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef  = useRef<Chart | null>(null);

  const buildData = useCallback((h: PricePoint[]) => ({
    labels: h.map(p => new Date(Math.floor(p.ts / 1_000_000))),  // ns → ms
    datasets: [
      {
        label:       'BB Upper',
        data:        h.map(p => p.bb_upper),
        borderColor: COLORS.bbUpper,
        borderWidth: 1,
        borderDash:  [3, 3],
        pointRadius: 0,
        fill:        '+1',
        backgroundColor: COLORS.bbFill,
        tension:     0.2,
      },
      {
        label:       'BB Lower',
        data:        h.map(p => p.bb_lower),
        borderColor: COLORS.bbLower,
        borderWidth: 1,
        borderDash:  [3, 3],
        pointRadius: 0,
        fill:        false as const,
        tension:     0.2,
      },
      {
        label:       'VWAP',
        data:        h.map(p => p.vwap),
        borderColor: COLORS.vwap,
        borderWidth: 1.5,
        borderDash:  [5, 3],
        pointRadius: 0,
        fill:        false as const,
        tension:     0.3,
      },
      {
        label:       `EMA(12)`,
        data:        h.map(p => p.ema_fast),
        borderColor: COLORS.ema,
        borderWidth: 2,
        pointRadius: 0,
        fill:        false as const,
        tension:     0.3,
      },
    ],
  }), []);

  // Initialize chart once
  useEffect(() => {
    if (!canvasRef.current) return;
    chartRef.current = new Chart(canvasRef.current, {
      type: 'line',
      data: buildData(history),
      options: {
        animation:          false,
        responsive:         true,
        maintainAspectRatio: false,
        interaction:        { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) =>
                `${ctx.dataset.label}: $${Number(ctx.parsed.y).toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
            },
          },
        },
        scales: {
          x: {
            type:    'time',
            time:    { unit: 'second', displayFormats: { second: 'HH:mm:ss' } },
            ticks:   { maxTicksLimit: 6, color: '#888780', font: { size: 10 } },
            grid:    { color: 'rgba(128,128,128,0.08)' },
          },
          y: {
            ticks:  { maxTicksLimit: 6, color: '#888780', font: { size: 10 },
                       callback: (v) => '$' + Number(v).toLocaleString() },
            grid:   { color: 'rgba(128,128,128,0.08)' },
          },
        },
      },
    });

    return () => { chartRef.current?.destroy(); chartRef.current = null; };
  }, []);  // only on mount

  // Update chart data without re-creating (critical for performance)
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || history.length === 0) return;
    const newData = buildData(history);
    chart.data.labels = newData.labels;
    chart.data.datasets.forEach((ds, i) => {
      ds.data = newData.datasets[i].data;
    });
    chart.update('none');  // 'none' = skip animation
  }, [history, buildData]);

  return (
    <div style={{ position: 'relative', width: '100%', height }}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`Real-time EMA, VWAP and Bollinger Bands chart for ${symbol}`}
      >
        Live price chart for {symbol}
      </canvas>
    </div>
  );
}
