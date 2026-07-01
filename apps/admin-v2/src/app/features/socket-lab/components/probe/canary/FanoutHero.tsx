import { ACCENT, hexToRgba, pct, statusColor, statusOf } from '../../../lib/stats';
import Sparkline from '../../charts/Sparkline';

export interface FanoutHeroProps {
    series: number[];
    probeOpacity: number;
}

/** Fan-out latency 히어로 — PRIMARY SLI(p50 큰 수 + p95 + 스파크라인). */
export default function FanoutHero({ series, probeOpacity }: FanoutHeroProps) {
    const p50 = Math.round(pct(series, 50));
    const p95 = Math.round(pct(series, 95));
    const status = statusOf('fanout', p95);
    const color = statusColor(status);
    const valColor = status === 'green' ? 'var(--sm-text)' : color;
    const border = status === 'green' ? 'var(--sm-border)' : hexToRgba(color, 0.35);

    return (
        <div
            style={{
                background: 'var(--sm-panel)',
                border: `1px solid ${border}`,
                borderRadius: 12,
                padding: '20px 22px',
                display: 'grid',
                gridTemplateColumns: 'auto 1fr',
                gap: 24,
                alignItems: 'center',
            }}
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
                    <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '.02em', color: 'var(--sm-text-2)' }}>
                        Fan-out latency
                    </span>
                    <span
                        style={{
                            fontSize: 10,
                            color: ACCENT,
                            background: hexToRgba(ACCENT, 0.12),
                            borderRadius: 4,
                            padding: '1px 6px',
                            fontWeight: 600,
                        }}
                    >
                        ★ PRIMARY SLI
                    </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 18 }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span
                            style={{
                                fontFamily: "'Geist Mono',monospace",
                                fontSize: 46,
                                fontWeight: 600,
                                lineHeight: 1,
                                color: valColor,
                            }}
                        >
                            {p50}
                            <span style={{ fontSize: 18, color: 'var(--sm-text-6)', fontWeight: 400 }}> ms</span>
                        </span>
                        <span
                            style={{ fontSize: 10.5, color: 'var(--sm-text-6)', letterSpacing: '.04em', marginTop: 4 }}
                        >
                            p50 · pub → sub
                        </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span
                            style={{
                                fontFamily: "'Geist Mono',monospace",
                                fontSize: 26,
                                fontWeight: 500,
                                lineHeight: 1,
                                color: 'var(--sm-text-3)',
                            }}
                        >
                            {p95}
                            <span style={{ fontSize: 13, color: 'var(--sm-text-6)' }}> ms</span>
                        </span>
                        <span
                            style={{ fontSize: 10.5, color: 'var(--sm-text-6)', letterSpacing: '.04em', marginTop: 4 }}
                        >
                            p95
                        </span>
                    </div>
                </div>
            </div>
            <div style={{ opacity: probeOpacity }}>
                <Sparkline series={series} color={status === 'green' ? ACCENT : color} w={360} h={70} />
            </div>
        </div>
    );
}
