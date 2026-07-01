import { ACCENT, pct, statusColor, statusOf, type MetricKey } from '../../../lib/stats';
import type { MetricsMap } from '../../../model/monitor-types';
import Sparkline from '../../charts/Sparkline';

export interface SliTileGridProps {
    metrics: MetricsMap;
    probeOpacity: number;
}

interface TileDef {
    k: MetricKey;
    label: string;
    pct?: boolean;
    sub?: string;
}

const TILE_DEFS: TileDef[] = [
    { k: 'rtt', label: 'RTT', pct: true },
    { k: 'send', label: 'Send E2E', pct: true },
    { k: 'handshake', label: 'Handshake', sub: 'connect → auth' },
    { k: 'loss', label: 'Loss rate', sub: 'seq-gap based' },
    { k: 'catchup', label: 'Catch-up time', sub: 'gap → recover' },
    { k: 'reconnect', label: 'Reconnect time', sub: 'drop → reconnect' },
];

/** SLI 6타일 — RTT/Send E2E/Handshake/Loss/Catch-up/Reconnect + 스파크라인. */
export default function SliTileGrid({ metrics, probeOpacity }: SliTileGridProps) {
    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, opacity: probeOpacity }}>
            {TILE_DEFS.map(t => {
                const mm = metrics[t.k] || { series: [], unit: 'ms' };
                const ser = mm.series;
                const last = ser.length ? ser[ser.length - 1] : 0;
                const p50 = Math.round(pct(ser, 50));
                const p95 = Math.round(pct(ser, 95));
                const isLoss = t.k === 'loss';
                const refVal = t.pct ? p95 : last;
                const st = statusOf(t.k, refVal);
                const dot = statusColor(st);
                const valColor = st === 'green' ? 'var(--sm-text)' : dot;
                const bigNum = t.pct ? String(p50) : isLoss ? last.toFixed(2) : String(Math.round(last));
                const sub = t.pct ? `p95 ${p95} ${mm.unit}` : t.sub;
                return (
                    <div
                        key={t.k}
                        style={{
                            background: 'var(--sm-panel)',
                            border: '1px solid var(--sm-border)',
                            borderRadius: 10,
                            padding: '14px 16px',
                        }}
                    >
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                marginBottom: 10,
                            }}
                        >
                            <span style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--sm-text-3)' }}>
                                {t.label}
                            </span>
                            <span style={{ width: 7, height: 7, borderRadius: '50%', background: dot }} />
                        </div>
                        <div
                            style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }}
                        >
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span
                                    style={{
                                        fontFamily: "'Geist Mono',monospace",
                                        fontSize: 24,
                                        fontWeight: 600,
                                        lineHeight: 1,
                                        color: valColor,
                                    }}
                                >
                                    {bigNum}
                                    <span style={{ fontSize: 12, color: 'var(--sm-text-6)', fontWeight: 400 }}>
                                        {' '}
                                        {mm.unit}
                                    </span>
                                </span>
                                <span style={{ fontSize: 10.5, color: 'var(--sm-text-6)', marginTop: 5 }}>{sub}</span>
                            </div>
                            <div style={{ flexShrink: 0 }}>
                                <Sparkline series={ser} color={st === 'green' ? ACCENT : dot} w={96} h={34} />
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
