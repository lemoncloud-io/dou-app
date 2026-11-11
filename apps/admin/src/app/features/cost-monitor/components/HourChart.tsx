/**
 * `components/cost-monitor/HourChart.tsx`
 * - One KST day in hourly bars: estimated cost stacked by metric, or one metric's usage.
 */
import { useState, type JSX } from 'react';

import { KEYS, RATES, type UsageKey } from '../lib/cost';
import { niceCeil, num, usd, type CostRow } from '../lib/costRows';
import { METRIC_COLORS } from '../lib/display';

export type ChartMode = 'cost' | 'usage';

const L = 64;
const T = 20;
const W = 720;
const H = 200;
const BAR = W / 24;

export const HourChart = ({ row, mode, metric }: { row: CostRow; mode: ChartMode; metric: UsageKey }): JSX.Element => {
    const [hover, setHover] = useState<number>();
    const rate = RATES.find(r => r.key === metric) ?? RATES[0];
    const values =
        mode === 'cost'
            ? row.hours.map(hour => KEYS.map(key => hour[key]))
            : row.hourUsage.map(usage => [rate.toUnit(usage[metric], 1)]);
    const max = Math.max(...values.map(stack => stack.reduce((a, b) => a + b, 0)), 0);
    const top = niceCeil(max);
    const tick = (v: number): string => (mode === 'cost' ? `$${+v.toPrecision(3)}` : num(v));
    const tip = hover === undefined ? undefined : values[hover];

    return (
        <div className="relative" onMouseLeave={() => setHover(undefined)}>
            {tip && hover !== undefined && (
                <div
                    className="pointer-events-none absolute top-0 z-10 min-w-48 rounded-md border border-border bg-popover p-2 text-xs text-popover-foreground shadow-md"
                    style={{
                        left: `${((L + (hover + 0.5) * BAR) / (L + W)) * 100}%`,
                        transform: `translateX(${hover > 16 ? '-100%' : hover < 7 ? '0' : '-50%'})`,
                    }}
                >
                    <p className="mb-1 font-semibold">
                        {hover}:00–{hover + 1}:00 KST
                    </p>
                    {mode === 'cost' ? (
                        <>
                            <p className="flex justify-between gap-3">
                                <span>Total</span>
                                <b className="tabular-nums">{usd(tip.reduce((a, b) => a + b, 0))}</b>
                            </p>
                            {KEYS.map((key, j) => (
                                <p key={key} className="flex justify-between gap-3">
                                    <span>
                                        <i
                                            className="mr-1 inline-block size-2 rounded-sm"
                                            style={{ background: METRIC_COLORS[key] }}
                                        />
                                        {key}
                                    </span>
                                    <span className="tabular-nums">{usd(tip[j])}</span>
                                </p>
                            ))}
                        </>
                    ) : (
                        <p className="flex justify-between gap-3">
                            <span>{metric}</span>
                            <b className="tabular-nums">
                                {num(tip[0])} {rate.unit}
                            </b>
                        </p>
                    )}
                </div>
            )}
            <svg
                viewBox={`0 0 ${L + W} ${T + H + 20}`}
                className="w-full text-[10px]"
                role="img"
                aria-label="Hourly bars"
            >
                <g transform={`translate(${L},${T})`}>
                    {[0, 0.25, 0.5, 0.75, 1].map(f => (
                        <g key={f}>
                            <line x1={0} x2={W} y1={H - f * H} y2={H - f * H} className="stroke-border" />
                            <text x={-6} y={H - f * H + 4} textAnchor="end" className="fill-muted-foreground">
                                {tick(top * f)}
                            </text>
                        </g>
                    ))}
                    <text x={-L} y={-8} textAnchor="start" className="fill-muted-foreground">
                        {mode === 'cost' ? 'USD / hour' : `${rate.unit} / hour`}
                    </text>
                    {values.map((stack, i) => {
                        const ys = stack.reduce<number[]>(
                            (acc, v) => [...acc, acc[acc.length - 1] + (v / top) * H],
                            [0]
                        );
                        return (
                            <g key={i}>
                                {stack.map((v, j) =>
                                    v ? (
                                        <rect
                                            key={j}
                                            x={i * BAR + 2}
                                            width={BAR - 4}
                                            y={H - ys[j + 1]}
                                            height={ys[j + 1] - ys[j]}
                                            fill={mode === 'cost' ? METRIC_COLORS[KEYS[j]] : METRIC_COLORS[metric]}
                                        />
                                    ) : null
                                )}
                                {i % 3 === 0 && (
                                    <text
                                        x={i * BAR + BAR / 2}
                                        y={H + 15}
                                        textAnchor="middle"
                                        className="fill-muted-foreground"
                                    >
                                        {i}
                                    </text>
                                )}
                                {i === hover && (
                                    <rect x={i * BAR} width={BAR} y={0} height={H} className="fill-foreground/5" />
                                )}
                                <rect
                                    x={i * BAR}
                                    width={BAR}
                                    y={0}
                                    height={H}
                                    fill="transparent"
                                    onMouseEnter={() => setHover(i)}
                                />
                            </g>
                        );
                    })}
                </g>
            </svg>
        </div>
    );
};

/** The 24 hours of a row as tiny bars, scaled to the largest hour on screen. */
export const MiniBars = ({ row, max }: { row: CostRow; max: number }): JSX.Element => (
    <div className="flex h-6 w-36 items-end gap-px" title="Estimated cost, KST 0–23h">
        {row.hours.map((hour, i) => {
            const v = KEYS.reduce((sum, key) => sum + hour[key], 0);
            return (
                <i
                    key={i}
                    className="flex-1 rounded-sm bg-primary/70"
                    style={{ height: `${max ? Math.max((v / max) * 100, v ? 4 : 0) : 0}%` }}
                />
            );
        })}
    </div>
);
