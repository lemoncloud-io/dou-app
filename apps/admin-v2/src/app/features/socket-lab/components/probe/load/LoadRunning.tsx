import { ACCENT, hexToRgba } from '../../../lib/stats';
import type { LoadTest } from '../../../hooks/use-load-test';
import AreaTime from '../../charts/AreaTime';

export interface LoadRunningProps {
    load: LoadTest;
}

/** Load test running — 진행 바 + 라이브 fan-out + ramp/timeline 차트. */
export default function LoadRunning({ load }: LoadRunningProps) {
    const { run, config, pct } = load;
    const live = run.live;
    const rp = (q: number) => (live.length ? Math.round(pct(live, q)) + ' ms' : '—');
    const runPct = Math.min(100, Math.round((run.elapsed / Math.max(1, config.duration)) * 100));

    const tile = (label: string, value: string) => (
        <div
            style={{
                background: 'var(--sm-panel)',
                border: '1px solid var(--sm-border)',
                borderRadius: 10,
                padding: '14px 16px',
            }}
        >
            <div style={{ fontSize: 11, color: 'var(--sm-text-4)', marginBottom: 8 }}>{label}</div>
            <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 22, fontWeight: 600, lineHeight: 1 }}>
                {value}
            </div>
        </div>
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div
                style={{
                    background: 'var(--sm-panel)',
                    border: `1px solid ${hexToRgba(ACCENT, 0.25)}`,
                    borderRadius: 10,
                    padding: '16px 18px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span
                            style={{
                                width: 9,
                                height: 9,
                                borderRadius: '50%',
                                background: ACCENT,
                                animation: 'scPulse 1s ease-in-out infinite',
                            }}
                        />
                        <span style={{ fontWeight: 600, letterSpacing: '.06em', fontSize: 13, color: ACCENT }}>
                            RUNNING
                        </span>
                    </div>
                    <button
                        onClick={load.abortLoad}
                        style={{
                            appearance: 'none',
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                            fontSize: 12,
                            fontWeight: 600,
                            borderRadius: 7,
                            padding: '7px 15px',
                            background: 'rgba(248,81,73,.12)',
                            border: '1px solid rgba(248,81,73,.4)',
                            color: '#f85149',
                        }}
                    >
                        ■ Abort
                    </button>
                </div>
                <div style={{ height: 8, background: 'var(--sm-panel-2)', borderRadius: 5, overflow: 'hidden' }}>
                    <div
                        style={{
                            height: '100%',
                            width: `${runPct}%`,
                            background: ACCENT,
                            borderRadius: 5,
                            transition: 'width .4s ease',
                        }}
                    />
                </div>
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 18,
                        fontFamily: "'Geist Mono',monospace",
                        fontSize: 12,
                        color: 'var(--sm-text-3)',
                    }}
                >
                    <span style={{ color: 'var(--sm-text)', fontWeight: 500 }}>
                        {run.elapsed}s / {config.duration}s
                    </span>
                    <span>
                        conns{' '}
                        <span style={{ color: ACCENT }}>
                            {run.conns}/{config.subs}
                        </span>{' '}
                        established
                    </span>
                    <span>
                        sent <span style={{ color: 'var(--sm-text-2)' }}>{run.sent.toLocaleString()}</span>
                    </span>
                    <span>
                        recv <span style={{ color: 'var(--sm-text-2)' }}>{run.recv.toLocaleString()}</span>
                    </span>
                </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.1fr', gap: 14 }}>
                <div
                    style={{
                        background: 'var(--sm-sidebar)',
                        border: '1px solid var(--sm-border)',
                        borderRadius: 10,
                        overflow: 'hidden',
                    }}
                >
                    <div
                        style={{
                            padding: '11px 16px',
                            borderBottom: '1px solid var(--sm-border)',
                            background: 'var(--sm-panel)',
                            fontSize: 11,
                            fontWeight: 600,
                            letterSpacing: '.05em',
                            color: 'var(--sm-text-5)',
                            textTransform: 'uppercase',
                        }}
                    >
                        Active Connections (ramp)
                    </div>
                    <div style={{ padding: '14px 12px' }}>
                        <AreaTime
                            series={run.ramp.length ? run.ramp : [0]}
                            target={config.subs}
                            w={340}
                            h={96}
                            accent={ACCENT}
                            label="N cap"
                        />
                    </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {tile('Fan-out p50', rp(50))}
                    {tile('Fan-out p95', rp(95))}
                    {tile('Fan-out p99', rp(99))}
                    {tile('Max latency', live.length ? Math.max(...live) + ' ms' : '—')}
                </div>
            </div>
            <div
                style={{
                    background: 'var(--sm-sidebar)',
                    border: '1px solid var(--sm-border)',
                    borderRadius: 10,
                    overflow: 'hidden',
                }}
            >
                <div
                    style={{
                        padding: '11px 16px',
                        borderBottom: '1px solid var(--sm-border)',
                        background: 'var(--sm-panel)',
                        fontSize: 11,
                        fontWeight: 600,
                        letterSpacing: '.05em',
                        color: 'var(--sm-text-5)',
                        textTransform: 'uppercase',
                    }}
                >
                    Latency over time
                </div>
                <div style={{ padding: '14px 12px' }}>
                    <AreaTime
                        series={live.length ? live : [0]}
                        target={100}
                        w={720}
                        h={110}
                        accent={ACCENT}
                        label="SLO 100ms"
                    />
                </div>
            </div>
        </div>
    );
}
