// src/components/PriceChart.jsx
import { useEffect, useRef } from 'react';
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);

const CHART_COLORS = {
    price:      '#1D9E75',
    vwap:       '#534AB7',
    priceFill:  'rgba(29,158,117,0.06)',
    grid:       'rgba(128,128,128,0.1)',
    tick:       '#888',
};

export default function PriceChart({ symbol, history, height = 220 }) {
    const canvasRef = useRef(null);
    const chartRef  = useRef(null);

    useEffect(() => {
        if (!canvasRef.current) return;
        const ctx = canvasRef.current.getContext('2d');

        chartRef.current = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'Price',
                        data: [],
                        borderColor: CHART_COLORS.price,
                        backgroundColor: CHART_COLORS.priceFill,
                        borderWidth: 1.5,
                        pointRadius: 0,
                        tension: 0.3,
                        fill: true,
                        order: 1,
                    },
                    {
                        label: 'VWAP',
                        data: [],
                        borderColor: CHART_COLORS.vwap,
                        borderWidth: 1,
                        borderDash: [5, 4],
                        pointRadius: 0,
                        tension: 0.3,
                        fill: false,
                        order: 2,
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(20,20,20,0.85)',
                        titleColor: '#aaa',
                        bodyColor: '#fff',
                        borderColor: 'rgba(255,255,255,0.1)',
                        borderWidth: 1,
                        callbacks: {
                            label: (ctx) => {
                                const val = ctx.parsed.y;
                                return `${ctx.dataset.label}: $${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        display: false,
                        ticks: { autoSkip: true, maxTicksLimit: 6 }
                    },
                    y: {
                        position: 'right',
                        ticks: {
                            font: { family: 'monospace', size: 10 },
                            color: CHART_COLORS.tick,
                            maxTicksLimit: 5,
                            callback: (v) => '$' + v.toLocaleString()
                        },
                        grid: { color: CHART_COLORS.grid }
                    }
                }
            }
        });

        return () => {
            chartRef.current?.destroy();
            chartRef.current = null;
        };
    }, []);

    // Update chart data whenever history changes
    useEffect(() => {
        const chart = chartRef.current;
        if (!chart || !history) return;

        const labels = history.timestamps.map((ts) => {
            const d = new Date(ts / 1000);
            return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}:${d.getSeconds().toString().padStart(2,'0')}`;
        });

        chart.data.labels                  = labels;
        chart.data.datasets[0].data        = history.prices;
        chart.data.datasets[1].data        = history.vwaps;
        chart.update('none');
    }, [history]);

    return (
        <div style={{ position: 'relative', width: '100%', height }}>
            <canvas
                ref={canvasRef}
                role="img"
                aria-label={`Real-time price and VWAP chart for ${symbol}`}
            >
                Live price chart for {symbol}
            </canvas>
        </div>
    );
}
