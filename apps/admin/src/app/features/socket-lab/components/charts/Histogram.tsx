import type { ReactNode } from 'react';

import { hexToRgba } from '../../lib/stats';

export interface PctMarker {
    v: number;
    c: string;
    label: string;
}

export interface HistogramProps {
    samples: number[];
    w: number;
    h: number;
    accent: string;
    pcs?: PctMarker[];
}

export default function Histogram({ samples, w, h, accent, pcs }: HistogramProps) {
    const padL = 8;
    const padT = 14;
    const padR = 8;
    const padB = 24;
    const iw = w - padL - padR;
    const ih = h - padT - padB;
    const B = 26;
    const min = Math.min(...samples);
    const max = Math.max(...samples);
    const bw = (max - min) / B || 1;
    const bins = new Array(B).fill(0);
    samples.forEach(v => {
        let i = Math.floor((v - min) / bw);
        if (i >= B) i = B - 1;
        if (i < 0) i = 0;
        bins[i]++;
    });
    const cmax = Math.max(...bins) || 1;
    const els: ReactNode[] = [];
    bins.forEach((c, i) => {
        const x = padL + (i / B) * iw;
        const bh = (c / cmax) * ih;
        els.push(
            <rect
                key={i}
                x={x + 1}
                y={padT + ih - bh}
                width={iw / B - 1.5}
                height={bh}
                fill={hexToRgba(accent, 0.42)}
                rx={1}
            />
        );
    });
    (pcs || []).forEach((p, i) => {
        const x = padL + ((p.v - min) / (max - min || 1)) * iw;
        els.push(
            <line
                key={'p' + i}
                x1={x}
                x2={x}
                y1={padT}
                y2={padT + ih}
                stroke={p.c}
                strokeWidth={1.4}
                strokeDasharray="3 2"
            />
        );
        els.push(
            <text key={'pt' + i} x={x} y={padT - 2} fontSize={8.5} fill={p.c} textAnchor="middle">
                {p.label}
            </text>
        );
        els.push(
            <text
                key={'px' + i}
                x={x}
                y={h - 8}
                fontSize={8.5}
                style={{ fill: 'var(--sm-text-6)' }}
                textAnchor="middle"
                fontFamily="Geist Mono, monospace"
            >
                {Math.round(p.v)}
            </text>
        );
    });
    return (
        <svg viewBox={`0 0 ${w} ${h}`} style={{ display: 'block', width: '100%', height: 'auto' }}>
            {els}
        </svg>
    );
}
