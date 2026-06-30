import { ACCENT, hexToRgba } from '../../../lib/stats';
import type { LoadTest } from '../../../hooks/use-load-test';
import AreaTime from '../../charts/AreaTime';
import Histogram from '../../charts/Histogram';
import LineChart from '../../charts/LineChart';

export interface LoadReportProps {
    load: LoadTest;
}

const panelHead = (title: React.ReactNode) => (
    <div
        style={{
            padding: '11px 16px',
            borderBottom: '1px solid #1a212c',
            background: '#0e131b',
            fontSize: 12,
            fontWeight: 600,
            color: '#c2cad3',
        }}
    >
        {title}
    </div>
);

const verdictColorOf = (v: string) => (v === 'PASS' ? '#3fb950' : v === 'WARN' ? '#d29922' : '#f85149');

/** Load test 리포트 — Verdict + KPI + headline 곡선 + 분포/공정성/throughput/완전성/connect + 회귀 비교. */
export default function LoadReport({ load }: LoadReportProps) {
    const rep = load.report;
    if (!rep) return null;
    const { savedRuns, compareId } = load;
    const cmp = compareId ? (savedRuns.find(r => r.id === compareId) ?? null) : null;

    const vc = rep.aborted ? '#7d8590' : verdictColorOf(rep.verdict);
    const verdictBg = hexToRgba(vc, 0.1);
    const verdictBorder = hexToRgba(vc, 0.3);

    const kpi = (label: string, value: string | number, color?: string) => (
        <div style={{ background: '#0e131b', border: '1px solid #1a212c', borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ fontSize: 10.5, color: '#7d8590', marginBottom: 7 }}>{label}</div>
            <div
                style={{
                    fontFamily: "'Geist Mono',monospace",
                    fontSize: typeof value === 'string' && value.includes('/') ? 14 : 20,
                    fontWeight: 600,
                    lineHeight: typeof value === 'string' && value.includes('/') ? 1.3 : 1,
                    color,
                }}
            >
                {value}
            </div>
        </div>
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* VERDICT */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: verdictBg,
                    border: `1px solid ${verdictBorder}`,
                    borderRadius: 10,
                    padding: '14px 18px',
                    flexWrap: 'wrap',
                    gap: 12,
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <span
                        style={{
                            fontSize: 14,
                            fontWeight: 700,
                            letterSpacing: '.05em',
                            color: vc,
                            background: verdictBg,
                            border: `1px solid ${verdictBorder}`,
                            borderRadius: 7,
                            padding: '5px 14px',
                        }}
                    >
                        {rep.aborted ? 'ABORTED' : rep.verdict}
                    </span>
                    <span style={{ fontFamily: "'Geist Mono',monospace", fontSize: 12.5, color: '#c2cad3' }}>
                        fan-out p95 {rep.fanoutP95}ms @ N={rep.peakN} · SLO&lt;{rep.slo}ms
                    </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                        onClick={load.saveRun}
                        style={{
                            appearance: 'none',
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                            fontSize: 12,
                            fontWeight: 600,
                            borderRadius: 7,
                            padding: '8px 14px',
                            background: '#11161f',
                            border: '1px solid #1c2530',
                            color: '#c2cad3',
                        }}
                    >
                        Save run
                    </button>
                    <button
                        onClick={load.resetLoad}
                        style={{
                            appearance: 'none',
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                            fontSize: 12,
                            fontWeight: 600,
                            borderRadius: 7,
                            padding: '8px 14px',
                            background: hexToRgba(ACCENT, 0.12),
                            border: `1px solid ${hexToRgba(ACCENT, 0.35)}`,
                            color: ACCENT,
                        }}
                    >
                        새 테스트
                    </button>
                </div>
            </div>

            {/* KPI 6 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 10 }}>
                {kpi('Peak N', rep.peakN)}
                {kpi('Fan-out p95', rep.fanoutP95 + ' ms', rep.fanoutP95 < rep.slo ? '#e6edf3' : '#f85149')}
                {kpi('Max latency', rep.maxLat + ' ms')}
                {kpi(
                    'Throughput',
                    `${rep.throughputAchieved.toLocaleString()} / ${rep.throughputTarget.toLocaleString()}`
                )}
                {kpi('Loss', rep.lossPct.toFixed(2) + ' %', rep.lossPct > 1 ? '#d29922' : '#e6edf3')}
                {kpi('Connect fail', rep.connFail, rep.connFail > 0 ? '#f85149' : '#e6edf3')}
            </div>

            {/* HEADLINE */}
            <div style={{ background: '#0c1118', border: '1px solid #1a212c', borderRadius: 10, overflow: 'hidden' }}>
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '11px 16px',
                        borderBottom: '1px solid #1a212c',
                        background: '#0e131b',
                    }}
                >
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#c2cad3' }}>
                        Fan-out latency vs 구독자 수{' '}
                        <span
                            style={{
                                color: '#d29922',
                                fontSize: 10,
                                background: 'rgba(210,153,34,.1)',
                                borderRadius: 4,
                                padding: '1px 6px',
                            }}
                        >
                            ★ HEADLINE
                        </span>
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 10.5, color: '#7d8590' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <span style={{ width: 14, height: 2, background: ACCENT }} />
                            p95
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <span style={{ width: 14, height: 2, background: hexToRgba(ACCENT, 0.5) }} />
                            p50
                        </span>
                        {cmp ? (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                <span style={{ width: 14, height: 0, borderTop: '2px dashed #7d8590' }} />
                                baseline
                            </span>
                        ) : null}
                    </div>
                </div>
                <div style={{ padding: '14px 16px' }}>
                    <LineChart
                        curve={rep.curve}
                        w={820}
                        h={250}
                        accent={ACCENT}
                        baseline={cmp ? cmp.curve : null}
                        kneeN={rep.kneeN}
                    />
                </div>
                <div style={{ padding: '0 16px 13px', fontSize: 11.5, color: '#9aa4af' }}>
                    {rep.kneeN ? `knee 관측: N=${rep.kneeN} 부근에서 p95 급증` : 'knee 미관측 — 측정 범위 내 안정적'}
                </div>
                {cmp ? (
                    <div
                        style={{
                            padding: '0 16px 13px',
                            fontFamily: "'Geist Mono',monospace",
                            fontSize: 11,
                            color: '#7d8590',
                        }}
                    >
                        baseline: {cmp.label} (p95 {cmp.p95}ms) → 현재 {rep.fanoutP95}ms · Δ{' '}
                        {(rep.fanoutP95 - cmp.p95 >= 0 ? '+' : '') + (rep.fanoutP95 - cmp.p95)}ms
                    </div>
                ) : null}
            </div>

            {/* 분포 + 공정성 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div
                    style={{ background: '#0c1118', border: '1px solid #1a212c', borderRadius: 10, overflow: 'hidden' }}
                >
                    {panelHead(
                        <>
                            Latency 분포{' '}
                            <span style={{ color: '#5a636e', fontSize: 10.5, fontWeight: 400 }}>(p50 / p95 / p99)</span>
                        </>
                    )}
                    <div style={{ padding: '14px 16px' }}>
                        <Histogram
                            samples={rep.histSamples}
                            w={420}
                            h={180}
                            accent={ACCENT}
                            pcs={[
                                { v: rep.p50, c: '#3fb950', label: 'p50' },
                                { v: rep.p95, c: '#d29922', label: 'p95' },
                                { v: rep.p99, c: '#f85149', label: 'p99' },
                            ]}
                        />
                    </div>
                </div>
                <div
                    style={{ background: '#0c1118', border: '1px solid #1a212c', borderRadius: 10, overflow: 'hidden' }}
                >
                    {panelHead('구독자별 tail / 공정성')}
                    <div style={{ padding: 16 }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
                            {rep.perSubCells.map(c => (
                                <span
                                    key={c.i}
                                    title={c.title}
                                    style={{
                                        width: 15,
                                        height: 15,
                                        borderRadius: 3,
                                        background: c.color,
                                        boxShadow: c.isWorst ? '0 0 0 2px #f85149' : 'none',
                                    }}
                                />
                            ))}
                        </div>
                        <div
                            style={{
                                fontFamily: "'Geist Mono',monospace",
                                fontSize: 11,
                                color: '#9aa4af',
                                lineHeight: 1.5,
                            }}
                        >
                            worst/median {rep.fairness}× · 최악 {rep.worst}ms / 중앙값 {rep.median}ms
                        </div>
                        <div style={{ display: 'flex', gap: 14, marginTop: 10, fontSize: 10.5, color: '#5a636e' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                <span style={{ width: 9, height: 9, borderRadius: 2, background: '#3fb950' }} />
                                &lt;0.7×SLO
                            </span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                <span style={{ width: 9, height: 9, borderRadius: 2, background: '#d29922' }} />
                                &lt;SLO
                            </span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                <span style={{ width: 9, height: 9, borderRadius: 2, background: '#f85149' }} />
                                ≥SLO (느림)
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* throughput + completeness */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div
                    style={{ background: '#0c1118', border: '1px solid #1a212c', borderRadius: 10, overflow: 'hidden' }}
                >
                    {panelHead(
                        <>
                            Throughput — 목표 vs 실측{' '}
                            <span style={{ color: '#5a636e', fontSize: 10.5, fontWeight: 400 }}>deliveries/s</span>
                        </>
                    )}
                    <div style={{ padding: '14px 16px' }}>
                        <AreaTime
                            series={rep.dpsSeries}
                            target={rep.throughputTarget}
                            w={420}
                            h={180}
                            accent={ACCENT}
                            label="target"
                        />
                    </div>
                </div>
                <div
                    style={{ background: '#0c1118', border: '1px solid #1a212c', borderRadius: 10, overflow: 'hidden' }}
                >
                    {panelHead('Delivery completeness')}
                    <div style={{ padding: 16 }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
                            {rep.completenessCells.map(c => (
                                <span
                                    key={c.i}
                                    title={c.title}
                                    style={{ width: 15, height: 15, borderRadius: 3, background: c.color }}
                                />
                            ))}
                        </div>
                        <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 11, color: '#9aa4af' }}>
                            평균 수신율 {rep.avgComp.toFixed(1)}% · 유실 {rep.lossPct.toFixed(2)}%
                        </div>
                    </div>
                </div>
            </div>

            {/* connection */}
            <div style={{ background: '#0c1118', border: '1px solid #1a212c', borderRadius: 10, overflow: 'hidden' }}>
                {panelHead(
                    <>
                        Connection establishment{' '}
                        <span style={{ color: '#5a636e', fontSize: 10.5, fontWeight: 400 }}>
                            handshake latency 분포 · 동시 connect
                        </span>
                    </>
                )}
                <div style={{ padding: '14px 16px' }}>
                    <Histogram
                        samples={rep.connectSamples}
                        w={420}
                        h={160}
                        accent={ACCENT}
                        pcs={[
                            { v: rep.connP50, c: '#3fb950', label: 'p50' },
                            { v: rep.connP95, c: '#d29922', label: 'p95' },
                        ]}
                    />
                </div>
                <div
                    style={{
                        padding: '0 16px 13px',
                        fontFamily: "'Geist Mono',monospace",
                        fontSize: 11,
                        color: '#9aa4af',
                    }}
                >
                    connect p50 {rep.connP50}ms · p95 {rep.connP95}ms · 실패 {rep.connFail}
                </div>
            </div>

            {/* saved runs */}
            {savedRuns.length ? (
                <div
                    style={{ background: '#0c1118', border: '1px solid #1a212c', borderRadius: 10, overflow: 'hidden' }}
                >
                    <div
                        style={{
                            padding: '11px 16px',
                            borderBottom: '1px solid #1a212c',
                            background: '#0e131b',
                            fontSize: 11,
                            fontWeight: 600,
                            letterSpacing: '.05em',
                            color: '#6b747f',
                            textTransform: 'uppercase',
                        }}
                    >
                        저장된 실행 · 회귀 비교
                    </div>
                    <div>
                        {savedRuns.map(r => {
                            const active = r.id === compareId;
                            return (
                                <div
                                    key={r.id}
                                    style={{
                                        display: 'grid',
                                        gridTemplateColumns: '1fr 60px 90px 70px 120px',
                                        alignItems: 'center',
                                        gap: 10,
                                        padding: '11px 16px',
                                        borderBottom: '1px solid #141a23',
                                        fontFamily: "'Geist Mono',monospace",
                                        fontSize: 11.5,
                                    }}
                                >
                                    <span style={{ color: '#e6edf3' }}>{r.label}</span>
                                    <span style={{ color: '#5a636e' }}>{r.time}</span>
                                    <span style={{ color: '#9aa4af' }}>N={r.peakN}</span>
                                    <span style={{ color: '#c2cad3' }}>{r.p95}ms</span>
                                    <div
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'flex-end',
                                            gap: 8,
                                        }}
                                    >
                                        <span style={{ color: verdictColorOf(r.verdict), fontWeight: 600 }}>
                                            {r.verdict}
                                        </span>
                                        <button
                                            onClick={() => load.toggleCompare(r.id)}
                                            style={{
                                                appearance: 'none',
                                                cursor: 'pointer',
                                                fontFamily: 'inherit',
                                                fontSize: 10.5,
                                                fontWeight: 600,
                                                borderRadius: 5,
                                                padding: '4px 8px',
                                                background: '#11161f',
                                                border: '1px solid #1c2530',
                                                color: active ? ACCENT : '#9aa4af',
                                            }}
                                        >
                                            {active ? '비교 해제' : 'Compare'}
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ) : null}
        </div>
    );
}
