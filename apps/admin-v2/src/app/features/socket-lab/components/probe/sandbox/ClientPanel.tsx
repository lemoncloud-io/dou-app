import { ACCENT, hexToRgba } from '../../../lib/stats';
import type { ClientSnapshot, SandboxController } from '../../../runtime/sandbox-controller';

export interface ClientPanelProps {
    c: ClientSnapshot;
    ctrl: SandboxController;
    onRemove: () => void;
}

const STATUS_COLOR: Record<ClientSnapshot['status'], string> = {
    idle: 'var(--sm-text-6)',
    connecting: '#d29922',
    connected: '#2dd4bf',
    verified: '#3fb950',
    error: '#f85149',
    reconnecting: '#d29922',
};
const STATUS_LABEL: Record<ClientSnapshot['status'], string> = {
    idle: 'DISCONNECTED',
    connecting: 'CONNECTING',
    connected: 'CONNECTED',
    verified: 'VERIFIED',
    error: 'ERROR',
    reconnecting: 'RECONNECTING',
};
const THR: Record<string, [number, number]> = {
    rtt: [140, 280],
    send: [80, 160],
    handshake: [350, 600],
    recv: [90, 180],
};
const mColor = (k: string, v: number | null): string => {
    const t = THR[k];
    if (!t || v == null) return 'var(--sm-text)';
    return v > t[1] ? '#f85149' : v > t[0] ? '#d29922' : 'var(--sm-text)';
};
const soft = (hex: string) => hexToRgba(hex.startsWith('#') ? hex : '#5a636e', 0.13);

const ACCENT_SOFT = hexToRgba(ACCENT, 0.12);
const ACCENT_BORDER = hexToRgba(ACCENT, 0.35);

const ctrlBtn = {
    appearance: 'none' as const,
    cursor: 'pointer',
    fontFamily: 'inherit',
    borderRadius: 7,
    background: 'var(--sm-panel-2)',
    border: '1px solid var(--sm-border-2)',
    color: 'var(--sm-text-2)',
};

/** Gateway Sandbox 클라 1개 패널 — 헤더/인증/게이트웨이 액션/지표/로그. */
export default function ClientPanel({ c, ctrl, onRemove }: ClientPanelProps) {
    const dot = STATUS_COLOR[c.status];
    const pulsing = c.status === 'connecting' || c.status === 'reconnecting';
    const verified = c.status === 'verified';
    const connecting = c.status === 'connecting';
    const connectedOrMore = c.status === 'connected' || verified || c.status === 'reconnecting';
    const hasToken = !!c.token.trim();

    const m = c.metrics;
    const tiles = [
        {
            label: 'RTT',
            big: m.rtt?.p50,
            unit: 'ms',
            sub: m.rtt ? `p95 ${m.rtt.p95}` : 'req↔resp',
            color: mColor('rtt', m.rtt?.p95 ?? null),
        },
        {
            label: 'Handshake',
            big: m.handshake,
            unit: 'ms',
            sub: 'ws connect',
            color: mColor('handshake', m.handshake),
        },
        {
            label: 'Send E2E',
            big: m.send?.p50,
            unit: 'ms',
            sub: m.send ? `p95 ${m.send.p95}` : 'send→ack',
            color: mColor('send', m.send?.p95 ?? null),
        },
        {
            label: 'Recv E2E',
            big: m.recv?.p50,
            unit: 'ms',
            sub: m.recv ? `p95 ${m.recv.p95}` : 'cross-client',
            color: mColor('recv', m.recv?.p95 ?? null),
        },
    ];

    return (
        <div
            style={{
                background: 'var(--sm-panel)',
                border: '1px solid var(--sm-border)',
                borderRadius: 10,
                overflow: 'hidden',
                minWidth: 0,
                display: 'flex',
                flexDirection: 'column',
            }}
        >
            {/* header */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '11px 14px',
                    borderBottom: '1px solid var(--sm-border)',
                    background: 'var(--sm-deep)',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                    <span
                        style={{
                            width: 9,
                            height: 9,
                            borderRadius: '50%',
                            background: dot,
                            flexShrink: 0,
                            animation: pulsing ? 'scPulse 1.1s ease-in-out infinite' : 'none',
                        }}
                    />
                    <span
                        style={{
                            width: 18,
                            height: 18,
                            borderRadius: 5,
                            background: soft(c.color),
                            color: c.color,
                            fontSize: 10,
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                        }}
                    >
                        {c.letter}
                    </span>
                    <input
                        value={c.name}
                        onChange={e => ctrl.setName(e.target.value)}
                        style={{
                            background: 'none',
                            border: 'none',
                            outline: 'none',
                            color: 'var(--sm-text)',
                            fontFamily: "'Geist Mono',monospace",
                            fontSize: 12.5,
                            fontWeight: 500,
                            width: 130,
                            minWidth: 0,
                        }}
                    />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <span
                        style={{
                            fontSize: 9.5,
                            fontWeight: 700,
                            letterSpacing: '.05em',
                            color: dot,
                            background: soft(dot),
                            borderRadius: 5,
                            padding: '2px 8px',
                        }}
                    >
                        {STATUS_LABEL[c.status]}
                    </span>
                    <button
                        onClick={onRemove}
                        title="제거"
                        style={{
                            appearance: 'none',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: 'var(--sm-text-7)',
                            fontSize: 15,
                        }}
                    >
                        ×
                    </button>
                </div>
            </div>

            {/* auth */}
            <div
                style={{
                    padding: '12px 14px',
                    borderBottom: '1px solid var(--sm-border)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 9,
                }}
            >
                {/* WS 연결/해제 전용 버튼 (토큰 무관) */}
                {connecting ? (
                    <button
                        disabled
                        style={{
                            ...ctrlBtn,
                            fontSize: 12,
                            fontWeight: 600,
                            padding: 8,
                            cursor: 'default',
                            color: 'var(--sm-text-4)',
                        }}
                    >
                        연결 중…
                    </button>
                ) : connectedOrMore ? (
                    <button
                        onClick={() => void ctrl.disconnect()}
                        style={{ ...ctrlBtn, fontSize: 12, fontWeight: 600, padding: 8, color: 'var(--sm-text-2)' }}
                    >
                        Disconnect
                    </button>
                ) : (
                    <button
                        onClick={() => void ctrl.connectWs()}
                        style={{
                            appearance: 'none',
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                            fontSize: 12,
                            fontWeight: 600,
                            borderRadius: 7,
                            padding: 8,
                            background: ACCENT,
                            color: 'var(--sm-on-accent, #0a0d12)',
                            border: 'none',
                        }}
                    >
                        {c.status === 'error' ? '↻ Retry connect' : 'Connect'}
                    </button>
                )}

                {/* 토큰 — 연결 후에만 입력, 옆에 적용(Enter) 버튼 = 선택적 인증 */}
                <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.06em', color: 'var(--sm-text-5)' }}>
                    USER TOKEN {verified ? <span style={{ color: '#3fb950' }}>· verified</span> : null}
                </span>
                <div style={{ display: 'flex', gap: 6 }}>
                    <input
                        value={c.token}
                        onChange={e => ctrl.setToken(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Enter' && connectedOrMore && hasToken) void ctrl.authenticate();
                        }}
                        disabled={!connectedOrMore}
                        placeholder={connectedOrMore ? '유저 JWT/토큰 붙여넣기' : '연결 후 입력'}
                        spellCheck={false}
                        style={{
                            flex: 1,
                            minWidth: 0,
                            background: 'var(--sm-panel-2)',
                            border: '1px solid var(--sm-border-2)',
                            borderRadius: 7,
                            color: 'var(--sm-text)',
                            fontFamily: "'Geist Mono',monospace",
                            fontSize: 11.5,
                            padding: '8px 10px',
                            outline: 'none',
                            opacity: connectedOrMore ? 1 : 0.5,
                        }}
                    />
                    <button
                        onClick={() => void ctrl.authenticate()}
                        disabled={!connectedOrMore || !hasToken}
                        title="auth.update"
                        style={{
                            appearance: 'none',
                            cursor: connectedOrMore && hasToken ? 'pointer' : 'default',
                            fontFamily: 'inherit',
                            fontSize: 11.5,
                            fontWeight: 600,
                            borderRadius: 7,
                            padding: '8px 13px',
                            background: connectedOrMore && hasToken ? ACCENT : 'var(--sm-panel-2)',
                            color: connectedOrMore && hasToken ? 'var(--sm-on-accent, #0a0d12)' : 'var(--sm-text-6)',
                            border: connectedOrMore && hasToken ? 'none' : '1px solid var(--sm-border-2)',
                        }}
                    >
                        {verified ? '재인증' : '적용'}
                    </button>
                </div>
                {c.err ? <span style={{ fontSize: 11, color: '#f85149', lineHeight: 1.4 }}>{c.err}</span> : null}
                {c.deviceId ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, paddingTop: 2 }}>
                        <span
                            style={{ fontFamily: "'Geist Mono',monospace", fontSize: 10.5, color: 'var(--sm-text-5)' }}
                        >
                            userId{' '}
                            <span style={{ color: c.userId ? 'var(--sm-text-2)' : 'var(--sm-text-6)' }}>
                                {c.userId ?? '미인증'}
                            </span>
                        </span>
                        <span
                            style={{ fontFamily: "'Geist Mono',monospace", fontSize: 10.5, color: 'var(--sm-text-5)' }}
                        >
                            deviceId <span style={{ color: 'var(--sm-text-2)' }}>{`${c.deviceId}`.slice(0, 13)}…</span>
                        </span>
                    </div>
                ) : null}
            </div>

            {/* actions */}
            <div
                style={{
                    padding: '12px 14px',
                    borderBottom: '1px solid var(--sm-border)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                    opacity: verified ? 1 : 0.4,
                }}
            >
                {/* channel */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.06em', color: 'var(--sm-text-5)' }}>
                        CHANNEL
                    </span>
                    <div style={{ display: 'flex', gap: 6 }}>
                        <input
                            value={c.channelInput}
                            onChange={e => ctrl.setChannelInput(e.target.value)}
                            spellCheck={false}
                            style={{
                                flex: 1,
                                minWidth: 0,
                                background: 'var(--sm-panel-2)',
                                border: '1px solid var(--sm-border-2)',
                                borderRadius: 7,
                                color: 'var(--sm-text)',
                                fontFamily: "'Geist Mono',monospace",
                                fontSize: 11.5,
                                padding: '7px 9px',
                                outline: 'none',
                            }}
                        />
                        <button
                            onClick={() => void ctrl.create()}
                            style={{ ...ctrlBtn, fontSize: 11.5, fontWeight: 500, padding: '7px 11px' }}
                        >
                            Create
                        </button>
                        <button
                            onClick={() => void ctrl.join()}
                            style={{ ...ctrlBtn, fontSize: 11.5, fontWeight: 500, padding: '7px 11px' }}
                        >
                            Join
                        </button>
                    </div>
                    {c.channels.length ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {c.channels.map(ch => {
                                const active = ch === c.activeChannel;
                                return (
                                    <span
                                        key={ch}
                                        onClick={() => ctrl.setActiveChannel(ch)}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 6,
                                            cursor: 'pointer',
                                            fontFamily: "'Geist Mono',monospace",
                                            fontSize: 10.5,
                                            borderRadius: 6,
                                            padding: '3px 8px',
                                            background: active ? ACCENT_SOFT : 'var(--sm-panel-2)',
                                            border: `1px solid ${active ? ACCENT_BORDER : 'var(--sm-border-2)'}`,
                                            color: active ? ACCENT : 'var(--sm-text-3)',
                                        }}
                                    >
                                        {ch}
                                        <span
                                            onClick={e => {
                                                e.stopPropagation();
                                                void ctrl.leave(ch);
                                            }}
                                            style={{ cursor: 'pointer', opacity: 0.6, fontSize: 12 }}
                                        >
                                            ×
                                        </span>
                                    </span>
                                );
                            })}
                        </div>
                    ) : null}
                </div>
                {/* chat */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span
                            style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.06em', color: 'var(--sm-text-5)' }}
                        >
                            CHAT
                        </span>
                        <button
                            onClick={() => ctrl.toggleSync()}
                            style={{
                                appearance: 'none',
                                cursor: 'pointer',
                                fontFamily: 'inherit',
                                fontSize: 10,
                                fontWeight: 600,
                                borderRadius: 5,
                                padding: '3px 8px',
                                background: c.syncOn ? ACCENT_SOFT : 'var(--sm-panel-2)',
                                border: `1px solid ${c.syncOn ? ACCENT_BORDER : 'var(--sm-border-2)'}`,
                                color: c.syncOn ? ACCENT : 'var(--sm-text-4)',
                            }}
                        >
                            {c.syncOn ? 'sync ON' : 'sync off'}
                        </button>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                        <input
                            value={c.chatInput}
                            onChange={e => ctrl.setChatInput(e.target.value)}
                            spellCheck={false}
                            style={{
                                flex: 1,
                                minWidth: 0,
                                background: 'var(--sm-panel-2)',
                                border: '1px solid var(--sm-border-2)',
                                borderRadius: 7,
                                color: 'var(--sm-text)',
                                fontFamily: "'Geist Mono',monospace",
                                fontSize: 11.5,
                                padding: '7px 9px',
                                outline: 'none',
                            }}
                        />
                        <button
                            onClick={() => void ctrl.send()}
                            style={{
                                appearance: 'none',
                                cursor: 'pointer',
                                fontFamily: 'inherit',
                                fontSize: 11.5,
                                fontWeight: 600,
                                borderRadius: 7,
                                padding: '7px 15px',
                                background: ACCENT,
                                color: 'var(--sm-on-accent, #0a0d12)',
                                border: 'none',
                            }}
                        >
                            Send
                        </button>
                    </div>
                </div>
                {/* device / presence */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.06em', color: 'var(--sm-text-5)' }}>
                        DEVICE / PRESENCE
                    </span>
                    <div style={{ display: 'flex', gap: 6 }}>
                        <button
                            onClick={() => ctrl.saveDevice()}
                            style={{
                                ...ctrlBtn,
                                flex: 1,
                                fontFamily: "'Geist Mono',monospace",
                                fontSize: 10.5,
                                padding: '7px 4px',
                                color: 'var(--sm-text-3)',
                            }}
                        >
                            device.save
                        </button>
                        <button
                            onClick={() => ctrl.presence()}
                            style={{
                                ...ctrlBtn,
                                flex: 1,
                                fontFamily: "'Geist Mono',monospace",
                                fontSize: 10.5,
                                padding: '7px 4px',
                                color: 'var(--sm-text-3)',
                            }}
                        >
                            presence
                        </button>
                        <button
                            onClick={() => ctrl.viewing()}
                            style={{
                                ...ctrlBtn,
                                flex: 1,
                                fontFamily: "'Geist Mono',monospace",
                                fontSize: 10.5,
                                padding: '7px 4px',
                                color: 'var(--sm-text-3)',
                            }}
                        >
                            viewing
                        </button>
                    </div>
                </div>
            </div>

            {/* metrics */}
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--sm-border)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
                    {tiles.map(t => (
                        <div
                            key={t.label}
                            style={{
                                background: 'var(--sm-panel-2)',
                                border: '1px solid var(--sm-border-2)',
                                borderRadius: 7,
                                padding: '8px 9px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 4,
                            }}
                        >
                            <span
                                style={{
                                    fontSize: 9.5,
                                    color: 'var(--sm-text-5)',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                }}
                            >
                                {t.label}
                            </span>
                            <span
                                style={{
                                    fontFamily: "'Geist Mono',monospace",
                                    fontSize: 15,
                                    fontWeight: 600,
                                    color: t.big != null ? t.color : 'var(--sm-text-6)',
                                    lineHeight: 1,
                                }}
                            >
                                {t.big != null ? t.big : '—'}
                                {t.big != null ? (
                                    <span style={{ fontSize: 9, color: 'var(--sm-text-6)', fontWeight: 400 }}>
                                        {' '}
                                        {t.unit}
                                    </span>
                                ) : null}
                            </span>
                            <span style={{ fontSize: 9, color: 'var(--sm-text-6)', whiteSpace: 'nowrap' }}>
                                {t.sub}
                            </span>
                        </div>
                    ))}
                </div>
                <div
                    style={{
                        display: 'flex',
                        gap: 14,
                        marginTop: 9,
                        fontFamily: "'Geist Mono',monospace",
                        fontSize: 10.5,
                        color: 'var(--sm-text-4)',
                    }}
                >
                    <span>
                        tx <span style={{ color: ACCENT }}>{c.tx}</span>
                    </span>
                    <span>
                        rx <span style={{ color: 'var(--sm-text-2)' }}>{c.rx}</span>
                    </span>
                    <span>
                        loss <span style={{ color: '#f85149' }}>{c.lossCount}</span>
                    </span>
                </div>
            </div>

            {/* log */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '9px 14px',
                        background: 'var(--sm-deep)',
                        borderBottom: '1px solid var(--sm-border)',
                    }}
                >
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            fontSize: 10,
                            fontWeight: 600,
                            letterSpacing: '.05em',
                            color: 'var(--sm-text-5)',
                            textTransform: 'uppercase',
                        }}
                    >
                        EVENT LOG
                        <span
                            style={{
                                display: 'flex',
                                gap: 8,
                                fontWeight: 400,
                                textTransform: 'none',
                                letterSpacing: 0,
                                fontSize: 10,
                            }}
                        >
                            <span style={{ color: ACCENT }}>▲tx</span>
                            <span style={{ color: 'var(--sm-text-4)' }}>▼rx</span>
                        </span>
                    </div>
                    <button
                        onClick={() => ctrl.togglePause()}
                        style={{
                            ...ctrlBtn,
                            fontSize: 10,
                            fontWeight: 600,
                            padding: '4px 9px',
                            color: 'var(--sm-text-3)',
                        }}
                    >
                        {c.paused ? '▶' : '❚❚'}
                    </button>
                </div>
                <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                    {c.log.length ? (
                        c.log.map(l => (
                            <div
                                key={l.key}
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: '64px 15px 1fr 60px',
                                    alignItems: 'center',
                                    gap: 7,
                                    padding: '5px 14px',
                                    borderBottom: '1px solid var(--sm-raised-2)',
                                    background:
                                        l.level === 'error'
                                            ? 'rgba(248,81,73,0.06)'
                                            : l.level === 'warn'
                                              ? 'rgba(210,153,34,0.05)'
                                              : 'transparent',
                                    fontFamily: "'Geist Mono',monospace",
                                    fontSize: 11,
                                    animation: 'scFade .2s ease',
                                }}
                            >
                                <span style={{ color: 'var(--sm-text-6)' }}>{l.t}</span>
                                <span style={{ color: l.dir === 'tx' ? ACCENT : 'var(--sm-text-4)', fontSize: 9 }}>
                                    {l.dir === 'tx' ? '▲' : '▼'}
                                </span>
                                <span
                                    style={{
                                        color:
                                            l.level === 'error'
                                                ? '#f85149'
                                                : l.level === 'warn'
                                                  ? '#d29922'
                                                  : 'var(--sm-text-3)',
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                    }}
                                >
                                    {l.type}
                                    {l.label ? <span style={{ color: 'var(--sm-text-6)' }}> · {l.label}</span> : null}
                                </span>
                                <span
                                    style={{
                                        color: l.latency != null ? 'var(--sm-text-2)' : 'var(--sm-text-8)',
                                        textAlign: 'right',
                                    }}
                                >
                                    {l.latency != null ? `${l.latency} ms` : ''}
                                </span>
                            </div>
                        ))
                    ) : (
                        <div
                            style={{
                                padding: '26px 14px',
                                textAlign: 'center',
                                color: 'var(--sm-text-6)',
                                fontSize: 11,
                                lineHeight: 1.5,
                            }}
                        >
                            아직 이벤트 없음
                            <br />
                            Connect 후 게이트웨이를 호출하세요
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
