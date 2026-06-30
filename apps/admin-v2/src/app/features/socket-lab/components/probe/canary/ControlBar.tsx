import { ACCENT } from '../../../lib/stats';
import type { ConnStatus } from '../../../model/monitor-types';

export interface ControlBarProps {
    running: boolean;
    uptimeStr: string;
    sentStr: string;
    pubStatus: ConnStatus;
    subStatus: ConnStatus;
    gapDrop: boolean;
    onStart(): void;
    onStop(): void;
    toggleGapDrop(): void;
}

const stColor = (st: ConnStatus): string =>
    st === 'connected' ? '#3fb950' : st === 'error' ? '#f85149' : st === 'connecting' ? '#d29922' : '#5a636e';
const stLabel = (st: ConnStatus): string =>
    st === 'connected' ? 'connected' : st === 'error' ? 'error' : st === 'connecting' ? 'connecting…' : 'idle';

/** Canary 컨트롤 바 — Start/Stop + LIVE/uptime/frames + pub·sub 상태 + gap-drop 토글. */
export default function ControlBar({
    running,
    uptimeStr,
    sentStr,
    pubStatus,
    subStatus,
    gapDrop,
    onStart,
    onStop,
    toggleGapDrop,
}: ControlBarProps) {
    const conn = (label: string, st: ConnStatus) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: stColor(st) }} />
            <span style={{ fontFamily: "'Geist Mono',monospace", fontSize: 11.5, color: '#9aa4af' }}>
                {label} <span style={{ color: stColor(st) }}>{stLabel(st)}</span>
            </span>
        </div>
    );
    const stat = (value: string, label: string) => (
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}>
            <span style={{ fontFamily: "'Geist Mono',monospace", fontSize: 13, color: '#e6edf3', fontWeight: 500 }}>
                {value}
            </span>
            <span style={{ fontSize: 10, color: '#5a636e', letterSpacing: '.04em' }}>{label}</span>
        </div>
    );

    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: '#0e131b',
                border: '1px solid #1a212c',
                borderRadius: 10,
                padding: '13px 18px',
                flexWrap: 'wrap',
                gap: 14,
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
                {running ? (
                    <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                            <span
                                style={{
                                    width: 9,
                                    height: 9,
                                    borderRadius: '50%',
                                    background: '#3fb950',
                                    animation: 'scPulse 1.2s ease-in-out infinite,scRing 1.6s ease-out infinite',
                                }}
                            />
                            <span style={{ fontWeight: 600, letterSpacing: '.06em', fontSize: 12, color: '#3fb950' }}>
                                LIVE
                            </span>
                        </div>
                        {stat(uptimeStr, 'UPTIME')}
                        {stat(sentStr, 'FRAMES SENT')}
                    </>
                ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#5a636e' }} />
                        <span style={{ fontWeight: 600, letterSpacing: '.06em', fontSize: 12, color: '#7d8590' }}>
                            IDLE
                        </span>
                        <span style={{ fontSize: 11.5, color: '#5a636e' }}>
                            canary pub·sub 미연결 — 시작하면 __canary__ 채널에 2개 연결 후 측정
                        </span>
                    </div>
                )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                {running ? (
                    <>
                        {conn('pub', pubStatus)}
                        {conn('sub', subStatus)}
                        <div style={{ width: 1, height: 20, background: '#1c2530' }} />
                        <button
                            onClick={toggleGapDrop}
                            style={{
                                appearance: 'none',
                                cursor: 'pointer',
                                fontFamily: 'inherit',
                                fontSize: 11.5,
                                fontWeight: 600,
                                borderRadius: 7,
                                padding: '7px 13px',
                                background: gapDrop ? 'rgba(210,153,34,0.14)' : '#11161f',
                                border: `1px solid ${gapDrop ? 'rgba(210,153,34,0.4)' : '#1c2530'}`,
                                color: gapDrop ? '#d29922' : '#9aa4af',
                            }}
                        >
                            {gapDrop ? 'gap-drop 시뮬 ON' : 'gap-drop 시뮬'}
                        </button>
                        <button
                            onClick={onStop}
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
                            ■ 중지
                        </button>
                    </>
                ) : (
                    <button
                        onClick={onStart}
                        style={{
                            appearance: 'none',
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                            fontSize: 13,
                            fontWeight: 600,
                            borderRadius: 8,
                            padding: '9px 18px',
                            background: ACCENT,
                            color: '#0a0d12',
                            border: 'none',
                        }}
                    >
                        ▶ Canary 시작
                    </button>
                )}
            </div>
        </div>
    );
}
