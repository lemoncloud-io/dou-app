import type { ReactNode } from 'react';

import { hexToRgba } from '../../lib/stats';

export interface AreaTimeProps {
    series: number[];
    target: number;
    w: number;
    h: number;
    accent: string;
    label?: string;
}

/** 시간축 영역 차트 + target 기준선(ramp/timeline/throughput 공용). 디자인 areaTime 포팅. */
export default function AreaTime({ series, target, w, h, accent, label }: AreaTimeProps) {
    const padL = 40;
    const padT = 12;
    const padR = 12;
    const padB = 20;
    const iw = w - padL - padR;
    const ih = h - padT - padB;
    const n = series.length;
    const yMax = (Math.max(target, ...series) || 1) * 1.14;
    const X = (i: number) => padL + (n <= 1 ? 0 : (i / (n - 1)) * iw);
    const Y = (v: number) => padT + ih - (v / yMax) * ih;
    const pts = series.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
    const area = `M${padL},${padT + ih} L${pts.split(' ').join(' L')} L${X(n - 1)},${padT + ih} Z`;
    const ty = Y(target);
    const els: ReactNode[] = [
        <path key="a" d={area} fill={hexToRgba(accent, 0.14)} />,
        <polyline key="l" points={pts} fill="none" stroke={accent} strokeWidth={2} />,
        <line
            key="t"
            x1={padL}
            x2={w - padR}
            y1={ty}
            y2={ty}
            style={{ stroke: 'var(--sm-text-4)' }}
            strokeWidth={1.4}
            strokeDasharray="5 4"
        />,
        <text key="tt" x={w - padR} y={ty - 4} fontSize={8.5} style={{ fill: 'var(--sm-text-3)' }} textAnchor="end">
            {label || 'target'}
        </text>,
    ];
    [0, yMax / 2, yMax].forEach((v, i) =>
        els.push(
            <text
                key={'y' + i}
                x={padL - 6}
                y={Y(v) + 3}
                fontSize={9}
                style={{ fill: 'var(--sm-text-6)' }}
                textAnchor="end"
                fontFamily="Geist Mono, monospace"
            >
                {Math.round(v)}
            </text>
        )
    );
    return (
        <svg viewBox={`0 0 ${w} ${h}`} style={{ display: 'block', width: '100%', height: 'auto' }}>
            {els}
        </svg>
    );
}
