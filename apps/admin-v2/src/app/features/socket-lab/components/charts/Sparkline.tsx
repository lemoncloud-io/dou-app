import { hexToRgba } from '../../lib/stats';

export interface SparklineProps {
    series: number[];
    color: string;
    w?: number;
    h?: number;
}

/** 작은 시계열 추이선(영역 + 라인 + 끝점). 디자인 sparkEl 포팅. */
export default function Sparkline({ series, color, w = 132, h = 38 }: SparklineProps) {
    if (!series || series.length < 2) return null;
    const min = Math.min(...series);
    const max = Math.max(...series);
    const rng = max - min || 1;
    const X = (i: number) => (i / (series.length - 1)) * w;
    const Y = (v: number) => h - 2 - ((v - min) / rng) * (h - 4);
    const pts = series.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
    const area = `M0,${h} L${pts.replace(/ /g, ' L')} L${w},${h} Z`;
    const lx = X(series.length - 1);
    const ly = Y(series[series.length - 1]);
    return (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block', overflow: 'visible' }}>
            <path d={area} fill={hexToRgba(color, 0.1)} />
            <polyline
                points={pts}
                fill="none"
                stroke={color}
                strokeWidth={1.6}
                strokeLinejoin="round"
                strokeLinecap="round"
            />
            <circle cx={lx} cy={ly} r={2.4} fill={color} />
        </svg>
    );
}
