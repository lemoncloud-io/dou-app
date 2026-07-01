import type { ReactNode } from 'react';

import { ACCENT, hexToRgba } from '../../../lib/stats';
import type { LoadTest } from '../../../hooks/use-load-test';

export interface LoadConfigProps {
    load: LoadTest;
}

const row = (label: string, hint: string, control: ReactNode, last = false) => (
    <div
        style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 0',
            borderBottom: last ? 'none' : '1px solid var(--sm-raised-2)',
        }}
    >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 12.5, color: 'var(--sm-text-2)', fontWeight: 500 }}>{label}</span>
            <span style={{ fontSize: 10.5, color: 'var(--sm-text-6)' }}>{hint}</span>
        </div>
        {control}
    </div>
);

const numInput = (
    value: number,
    onChange: (v: string) => void,
    extra?: { min?: number; max?: number; step?: number }
) => (
    <input
        type="number"
        min={extra?.min}
        max={extra?.max}
        step={extra?.step}
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
            width: 84,
            background: 'var(--sm-panel-2)',
            border: '1px solid var(--sm-border-2)',
            borderRadius: 7,
            color: 'var(--sm-text)',
            fontFamily: "'Geist Mono',monospace",
            fontSize: 12.5,
            padding: '7px 10px',
            outline: 'none',
            textAlign: 'right',
        }}
    />
);

const PRESET_META = [
    { key: 'fanout', title: 'Fan-out scale', desc: 'N 1→50, 낮은 rate · degradation 곡선' },
    { key: 'throughput', title: 'Throughput', desc: 'N 고정, rate 최대 · 포화점' },
    { key: 'spike', title: 'Spike', desc: '0→N 순간 ramp · 연결 폭주' },
    { key: 'soak', title: 'Soak', desc: '낮은 rate, 긴 duration · 누수' },
];

export default function LoadConfig({ load }: LoadConfigProps) {
    const cfg = load.config;
    const seg = (on: boolean) => ({
        background: on ? hexToRgba(ACCENT, 0.12) : 'var(--sm-panel-2)',
        color: on ? ACCENT : 'var(--sm-text-3)',
    });

    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 14, alignItems: 'start' }}>
            {/* CONFIG */}
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
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '11px 16px',
                        borderBottom: '1px solid var(--sm-border)',
                        background: 'var(--sm-panel)',
                    }}
                >
                    <span
                        style={{
                            fontSize: 11,
                            fontWeight: 600,
                            letterSpacing: '.05em',
                            color: 'var(--sm-text-5)',
                            textTransform: 'uppercase',
                        }}
                    >
                        Load Test 설정
                    </span>
                    <span
                        style={{
                            fontFamily: "'Geist Mono',monospace",
                            fontSize: 10.5,
                            color: 'var(--sm-text-4)',
                            background: 'var(--sm-panel-2)',
                            border: '1px solid var(--sm-border-2)',
                            borderRadius: 6,
                            padding: '4px 9px',
                        }}
                    >
                        target __canary_load__ · 읽기전용
                    </span>
                </div>
                <div style={{ padding: '4px 18px 16px' }}>
                    {row(
                        'Subscribers (N)',
                        '동시 구독 연결 수',
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: 240 }}>
                            <input
                                type="range"
                                min={1}
                                max={50}
                                value={cfg.subs}
                                onChange={e => load.setConfig({ subs: +e.target.value })}
                                style={{ flex: 1 }}
                            />
                            <span
                                style={{
                                    fontFamily: "'Geist Mono',monospace",
                                    fontSize: 14,
                                    fontWeight: 600,
                                    color: 'var(--sm-text)',
                                    width: 32,
                                    textAlign: 'right',
                                }}
                            >
                                {cfg.subs}
                            </span>
                        </div>
                    )}
                    {row(
                        'Publishers (M)',
                        '동시 송신 연결 수 (1–5)',
                        numInput(cfg.pubs, v => load.setConfig({ pubs: Math.max(1, Math.min(5, +v || 1)) }), {
                            min: 1,
                            max: 5,
                        })
                    )}
                    {row(
                        'Send rate',
                        'publisher당 msg/s',
                        numInput(cfg.rate, v => load.setConfig({ rate: Math.max(1, +v || 1) }), { min: 1 })
                    )}
                    {row(
                        'Payload size',
                        '메시지 크기 (bytes)',
                        numInput(cfg.payload, v => load.setConfig({ payload: Math.max(16, +v || 16) }), {
                            min: 16,
                            step: 16,
                        })
                    )}
                    {row(
                        'Ramp-up',
                        'Staged = 단계적 증가로 knee 탐색',
                        <div
                            style={{
                                display: 'flex',
                                border: '1px solid var(--sm-border-2)',
                                borderRadius: 7,
                                overflow: 'hidden',
                            }}
                        >
                            <button
                                onClick={() => load.setConfig({ ramp: 'instant' })}
                                style={{
                                    appearance: 'none',
                                    cursor: 'pointer',
                                    fontFamily: 'inherit',
                                    fontSize: 12,
                                    padding: '6px 14px',
                                    border: 'none',
                                    ...seg(cfg.ramp === 'instant'),
                                }}
                            >
                                Instant
                            </button>
                            <button
                                onClick={() => load.setConfig({ ramp: 'staged' })}
                                style={{
                                    appearance: 'none',
                                    cursor: 'pointer',
                                    fontFamily: 'inherit',
                                    fontSize: 12,
                                    padding: '6px 14px',
                                    borderTop: 'none',
                                    borderRight: 'none',
                                    borderBottom: 'none',
                                    borderLeft: '1px solid var(--sm-border-2)',
                                    ...seg(cfg.ramp === 'staged'),
                                }}
                            >
                                Staged
                            </button>
                        </div>
                    )}
                    {row(
                        'Duration',
                        '종료 조건 (초)',
                        numInput(cfg.duration, v => load.setConfig({ duration: Math.max(5, +v || 5) }), { min: 5 })
                    )}
                    {row(
                        'gap-drop 주입',
                        '부하 중 유실 → catch-up 검증',
                        <button
                            onClick={() => load.setConfig({ gapDrop: !cfg.gapDrop })}
                            style={{
                                appearance: 'none',
                                cursor: 'pointer',
                                fontFamily: 'inherit',
                                fontSize: 11.5,
                                fontWeight: 600,
                                borderRadius: 7,
                                padding: '7px 13px',
                                border: `1px solid ${cfg.gapDrop ? hexToRgba(ACCENT, 0.35) : 'var(--sm-border-2)'}`,
                                ...seg(cfg.gapDrop),
                            }}
                        >
                            {cfg.gapDrop ? 'gap-drop 주입 ON' : 'gap-drop 주입 off'}
                        </button>,
                        true
                    )}
                </div>
            </div>

            {/* PRESETS + RUN */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        fontSize: 11,
                        color: '#d29922',
                        background: 'rgba(210,153,34,.08)',
                        border: '1px solid rgba(210,153,34,.22)',
                        borderRadius: 8,
                        padding: '9px 12px',
                        lineHeight: 1.4,
                    }}
                >
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#d29922', flexShrink: 0 }} />{' '}
                    browser-bound · 1탭 기준 최대 ~50 conns. 풀 로드테스트가 아닌 스케일 스모크 테스트.
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
                        프리셋 시나리오
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: 12 }}>
                        {PRESET_META.map(p => (
                            <button
                                key={p.key}
                                onClick={() => load.applyPreset(p.key)}
                                style={{
                                    appearance: 'none',
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                    fontFamily: 'inherit',
                                    background: 'var(--sm-panel-2)',
                                    border: '1px solid var(--sm-border-2)',
                                    borderRadius: 8,
                                    padding: '11px 12px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 4,
                                }}
                            >
                                <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--sm-text)' }}>
                                    {p.title}
                                </span>
                                <span style={{ fontSize: 10.5, color: 'var(--sm-text-5)', lineHeight: 1.4 }}>
                                    {p.desc}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
                <div
                    style={{
                        background: 'var(--sm-panel)',
                        border: '1px solid var(--sm-border)',
                        borderRadius: 10,
                        padding: '14px 16px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4,
                    }}
                >
                    <span style={{ fontSize: 11, color: 'var(--sm-text-4)' }}>예상 부하</span>
                    <span
                        style={{
                            fontFamily: "'Geist Mono',monospace",
                            fontSize: 22,
                            fontWeight: 600,
                            color: ACCENT,
                            lineHeight: 1.1,
                        }}
                    >
                        {(cfg.pubs * cfg.rate * cfg.subs).toLocaleString()}{' '}
                        <span style={{ fontSize: 12, color: 'var(--sm-text-6)', fontWeight: 400 }}>deliveries/s</span>
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--sm-text-6)', fontFamily: "'Geist Mono',monospace" }}>
                        {cfg.subs} subs × {cfg.rate} msg/s × {cfg.pubs} pub
                    </span>
                </div>
                <button
                    onClick={load.runLoad}
                    style={{
                        appearance: 'none',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        fontSize: 14,
                        fontWeight: 600,
                        borderRadius: 9,
                        padding: 14,
                        background: ACCENT,
                        color: 'var(--sm-bg)',
                        border: 'none',
                    }}
                >
                    ▶ &nbsp;Run load test
                </button>
            </div>
        </div>
    );
}
