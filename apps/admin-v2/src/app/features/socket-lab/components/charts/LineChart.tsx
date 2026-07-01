import type { ReactNode } from 'react';

import { hexToRgba } from '../../lib/stats';
import type { CurvePoint } from '../../model/monitor-types';

export interface LineChartProps {
    curve: CurvePoint[];
    w: number;
    h: number;
    accent: string;
    baseline?: CurvePoint[] | null;
    kneeN?: number | null;
}

/** Fan-out latency vs 구독자 수 라인 차트(gridline/SLO/knee/baseline 오버레이). 디자인 lineChart 포팅. */
export default function LineChart({ curve, w, h, accent, baseline, kneeN }: LineChartProps) {
    const padL = 42;
    const padT = 16;
    const padR = 16;
    const padB = 28;
    const iw = w - padL - padR;
    const ih = h - padT - padB;
    const xMax = curve.length ? curve[curve.length - 1].n : 1;
    let yMax = 100;
    curve.forEach(c => (yMax = Math.max(yMax, c.p95)));
    if (baseline) baseline.forEach(c => (yMax = Math.max(yMax, c.p95)));
    yMax *= 1.14;
    const X = (n: number) => padL + (xMax <= 1 ? 0 : (n - 1) / (xMax - 1)) * iw;
    const Y = (v: number) => padT + ih - (v / yMax) * ih;
    const pl = (a: CurvePoint[], k: 'p50' | 'p95') =>
        a.map(c => `${X(c.n).toFixed(1)},${Y(c[k]).toFixed(1)}`).join(' ');

    const els: ReactNode[] = [];
    for (let g = 0; g <= 4; g++) {
        const yv = (yMax * g) / 4;
        const yy = Y(yv);
        els.push(
            <line
                key={'g' + g}
                x1={padL}
                x2={w - padR}
                y1={yy}
                y2={yy}
                style={{ stroke: 'var(--sm-raised-3)' }}
                strokeWidth={1}
            />
        );
        els.push(
            <text
                key={'gl' + g}
                x={padL - 6}
                y={yy + 3}
                fontSize={9.5}
                style={{ fill: 'var(--sm-text-6)' }}
                textAnchor="end"
                fontFamily="Geist Mono, monospace"
            >
                {Math.round(yv)}
            </text>
        );
    }
    [1, Math.max(2, Math.ceil(xMax / 2)), xMax].forEach((n, i) =>
        els.push(
            <text
                key={'x' + i}
                x={X(n)}
                y={h - 9}
                fontSize={9.5}
                style={{ fill: 'var(--sm-text-6)' }}
                textAnchor="middle"
                fontFamily="Geist Mono, monospace"
            >
                {'N=' + n}
            </text>
        )
    );
    const sy = Y(100);
    els.push(
        <line
            key="slo"
            x1={padL}
            x2={w - padR}
            y1={sy}
            y2={sy}
            stroke="#f85149"
            strokeWidth={1.2}
            strokeDasharray="5 3"
            opacity={0.55}
        />
    );
    els.push(
        <text key="slt" x={w - padR} y={sy - 5} fontSize={9} fill="#f85149" textAnchor="end">
            SLO 100ms
        </text>
    );
    if (kneeN && kneeN <= xMax) {
        const kx = X(kneeN);
        els.push(
            <line
                key="k"
                x1={kx}
                x2={kx}
                y1={padT}
                y2={padT + ih}
                stroke="#d29922"
                strokeWidth={1.4}
                strokeDasharray="3 3"
            />
        );
        els.push(
            <text key="kt" x={kx + 4} y={padT + 11} fontSize={9} fill="#d29922">
                {'knee N=' + kneeN}
            </text>
        );
    }
    if (baseline && baseline.length) {
        els.push(
            <polyline
                key="bl"
                points={pl(baseline, 'p95')}
                fill="none"
                style={{ stroke: 'var(--sm-text-4)' }}
                strokeWidth={1.6}
                strokeDasharray="5 4"
            />
        );
    }
    els.push(
        <polyline key="p50" points={pl(curve, 'p50')} fill="none" stroke={hexToRgba(accent, 0.5)} strokeWidth={1.8} />
    );
    els.push(<polyline key="p95" points={pl(curve, 'p95')} fill="none" stroke={accent} strokeWidth={2.4} />);

    return (
        <svg viewBox={`0 0 ${w} ${h}`} style={{ display: 'block', width: '100%', height: 'auto' }}>
            {els}
        </svg>
    );
}
