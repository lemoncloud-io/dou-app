import { ACCENT, hexToRgba } from '../../../lib/stats';
import type { CanaryEvent } from '../../../model/monitor-types';

export interface EventStreamProps {
    events: CanaryEvent[];
    paused: boolean;
    togglePause(): void;
}

const Row = ({ e }: { e: CanaryEvent }) => {
    const lc = e.level === 'error' ? '#f85149' : e.level === 'warn' ? '#d29922' : '#c2cad3';
    const bg =
        e.level === 'error' ? 'rgba(248,81,73,0.06)' : e.level === 'warn' ? 'rgba(210,153,34,0.05)' : 'transparent';
    return (
        <div
            style={{
                display: 'grid',
                gridTemplateColumns: '70px 1fr 64px 66px',
                alignItems: 'center',
                gap: 8,
                padding: '7px 14px',
                borderBottom: '1px solid #121821',
                background: bg,
                fontFamily: "'Geist Mono',monospace",
                fontSize: 11.5,
                animation: 'scFade .2s ease',
            }}
        >
            <span style={{ color: '#5a636e' }}>{e.t}</span>
            <span
                style={{
                    color: e.level === 'info' ? '#9aa4af' : lc,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                }}
            >
                {e.type}
                {e.label ? <span style={{ color: '#6b747f' }}> · {e.label}</span> : null}
            </span>
            <span style={{ color: '#6b747f' }}>seq {e.seq}</span>
            <span style={{ color: e.latency != null ? '#c2cad3' : '#3f4751', textAlign: 'right' }}>
                {e.latency != null ? e.latency + ' ms' : '—'}
            </span>
        </div>
    );
};

const ClientStream = ({
    title,
    arrow,
    arrowColor,
    rows,
}: {
    title: string;
    arrow: string;
    arrowColor: string;
    rows: CanaryEvent[];
}) => (
    <div
        style={{
            background: '#0b0f16',
            border: '1px solid #1a212c',
            borderRadius: 8,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
        }}
    >
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '9px 14px',
                borderBottom: '1px solid #1a212c',
                background: '#0e131b',
            }}
        >
            <span
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 7,
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: '.04em',
                    color: '#9aa4af',
                }}
            >
                <span style={{ color: arrowColor }}>{arrow}</span>
                {title}
            </span>
            <span style={{ fontFamily: "'Geist Mono',monospace", fontSize: 10.5, color: '#5a636e' }}>
                {rows.length}
            </span>
        </div>
        <div style={{ maxHeight: 280, overflowY: 'auto' }}>
            {rows.length ? (
                rows.map(e => <Row key={e.id} e={e} />)
            ) : (
                <div style={{ padding: '28px 14px', textAlign: 'center', color: '#3f4751', fontSize: 11.5 }}>
                    이벤트 없음
                </div>
            )}
        </div>
    </div>
);

/** Frame Stream — pub/sub 클라이언트별 스트림 분리(2열). */
export default function EventStream({ events, paused, togglePause }: EventStreamProps) {
    const pubRows = events.filter(e => e.dir === 'pub');
    const subRows = events.filter(e => e.dir === 'sub');

    return (
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span
                        style={{
                            fontSize: 11,
                            fontWeight: 600,
                            letterSpacing: '.05em',
                            color: '#6b747f',
                            textTransform: 'uppercase',
                        }}
                    >
                        Frame Stream
                    </span>
                    <span style={{ fontFamily: "'Geist Mono',monospace", fontSize: 11, color: '#5a636e' }}>
                        {events.length} events · 클라이언트별 분리
                    </span>
                </div>
                <button
                    onClick={togglePause}
                    style={{
                        appearance: 'none',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        fontSize: 11,
                        fontWeight: 600,
                        borderRadius: 6,
                        padding: '5px 11px',
                        background: paused ? hexToRgba(ACCENT, 0.12) : '#11161f',
                        border: `1px solid ${paused ? hexToRgba(ACCENT, 0.35) : '#1c2530'}`,
                        color: paused ? ACCENT : '#9aa4af',
                    }}
                >
                    {paused ? '▶ 재개' : '❚❚ 일시정지'}
                </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: 12 }}>
                <ClientStream title="PUB CLIENT" arrow="▲" arrowColor={ACCENT} rows={pubRows} />
                <ClientStream title="SUB CLIENT" arrow="▼" arrowColor="#7d8590" rows={subRows} />
            </div>
        </div>
    );
}
