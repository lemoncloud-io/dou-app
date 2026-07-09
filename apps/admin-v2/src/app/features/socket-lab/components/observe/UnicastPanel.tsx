import { useMemo, useState } from 'react';

import type { PushPayload, UnicastResult } from '@lemoncloud/chatic-sockets-api';
import { Send, X } from 'lucide-react';

import { ACCENT, hexToRgba, presenceColor } from '../../lib/stats';
import { buildSimplePush, buildUnicastEvent, sendUnicast, type UnicastTarget } from '../../api/unicastApi';
import type { UsersStage } from '../../api/userApi';
import type { ObservedDevice, ObservedUser } from '../../mock/observed-users';

/**
 * `components/observe/UnicastPanel.tsx`
 */
export interface UnicastPanelProps {
    stage: UsersStage;
    user: ObservedUser;
    device: ObservedDevice;
    onClose: () => void;
}

const STAGE_BADGE: Record<UsersStage, { label: string; color: string }> = {
    d1: { label: 'DEV (d1)', color: '#3fb950' },
    v1: { label: 'PROD (v1)', color: '#e5484d' },
};

const labelStyle = {
    fontSize: 10.5,
    fontWeight: 600,
    letterSpacing: '.05em',
    color: 'var(--sm-text-5)',
    textTransform: 'uppercase',
} as const;

const fieldStyle = {
    background: 'var(--sm-panel-2)',
    border: '1px solid var(--sm-border-3)',
    borderRadius: 8,
    color: 'var(--sm-text)',
    fontFamily: "'Geist Mono',monospace",
    fontSize: 12,
    padding: '8px 10px',
    outline: 'none',
} as const;

const parseJson = (text: string): { value?: unknown; error?: string } => {
    try {
        return { value: JSON.parse(text) };
    } catch (e) {
        return { error: e instanceof Error ? e.message : `${e}` };
    }
};

function Toggle({ on, onChange, label }: { on: boolean; onChange: (next: boolean) => void; label: string }) {
    return (
        <button
            onClick={() => onChange(!on)}
            style={{
                appearance: 'none',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '.04em',
                borderRadius: 6,
                padding: '4px 10px',
                background: on ? hexToRgba(ACCENT, 0.14) : 'var(--sm-panel-2)',
                border: `1px solid ${on ? hexToRgba(ACCENT, 0.4) : 'var(--sm-border-2)'}`,
                color: on ? ACCENT : 'var(--sm-text-5)',
            }}
        >
            {label} {on ? 'ON' : 'OFF'}
        </button>
    );
}

export default function UnicastPanel({ stage, user, device, onClose }: UnicastPanelProps) {
    const [targetType, setTargetType] = useState<UnicastTarget>('device');
    const [targetId, setTargetId] = useState(device.id);
    const [eventType, setEventType] = useState('admin.test');
    const [dataText, setDataText] = useState('{\n  "type": "chat.test",\n  "content": "hello"\n}');
    const [pushOn, setPushOn] = useState(false);
    const [pushMode, setPushMode] = useState<'simple' | 'json'>('simple');
    const [pushSender, setPushSender] = useState('');
    const [pushContent, setPushContent] = useState('');
    const [pushText, setPushText] = useState('');
    const [viewingOn, setViewingOn] = useState(false);
    const [viewingId, setViewingId] = useState(device.viewing ?? '');
    const [sending, setSending] = useState(false);
    const [result, setResult] = useState<{ value: UnicastResult; at: number } | null>(null);
    const [error, setError] = useState<string | null>(null);

    const dataParsed = useMemo(() => parseJson(dataText), [dataText]);
    const pushJsonOn = pushOn && pushMode === 'json';
    const pushParsed = useMemo(() => (pushJsonOn ? parseJson(pushText) : {}), [pushJsonOn, pushText]);
    const pushShapeError =
        pushJsonOn && !pushParsed.error && (typeof pushParsed.value !== 'object' || Array.isArray(pushParsed.value))
            ? 'push$는 JSON 객체여야 합니다'
            : null;
    const wsOnlyBlocked = !pushOn && targetType === 'device' && device.status === 'red';
    const canSend =
        !sending &&
        !wsOnlyBlocked &&
        !!targetId.trim() &&
        !!eventType.trim() &&
        !dataParsed.error &&
        (!pushOn || pushMode !== 'simple' || !!pushContent.trim()) &&
        (!pushJsonOn || (!pushParsed.error && !pushShapeError)) &&
        (!viewingOn || !!viewingId.trim());

    const selectTarget = (next: UnicastTarget) => {
        setTargetType(next);
        setTargetId(next === 'device' ? device.id : user.id);
    };

    const selectPushMode = (next: 'simple' | 'json') => {
        setPushMode(next);
        if (next === 'json') {
            setPushText(JSON.stringify(buildSimplePush(eventType.trim(), pushSender, pushContent), null, 2));
        }
    };

    const send = () => {
        setSending(true);
        setResult(null);
        setError(null);
        const event = buildUnicastEvent({
            targetType,
            targetId: targetId.trim(),
            type: eventType.trim(),
            data: dataParsed.value,
            push: !pushOn
                ? null
                : pushMode === 'simple'
                  ? buildSimplePush(eventType.trim(), pushSender, pushContent)
                  : (pushParsed.value as PushPayload),
            viewing: viewingOn && viewingId.trim() ? { type: 'channel', id: viewingId.trim() } : null,
        });
        sendUnicast(stage, event)
            .then(r => setResult({ value: r, at: Date.now() }))
            .catch(e => setError(e instanceof Error ? e.message : `${e}`))
            .finally(() => setSending(false));
    };

    const sendOnEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && canSend) send();
    };

    const badge = STAGE_BADGE[stage];
    const dc = presenceColor(device.status);

    return (
        <div
            style={{
                background: 'var(--sm-sidebar)',
                border: '1px solid var(--sm-border)',
                borderRadius: 10,
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
            }}
        >
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '11px 14px',
                    borderBottom: '1px solid var(--sm-border)',
                    background: 'var(--sm-panel)',
                    flexShrink: 0,
                }}
            >
                <span style={labelStyle}>Unicast</span>
                <span
                    style={{
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: '.05em',
                        color: badge.color,
                        background: hexToRgba(badge.color, 0.13),
                        borderRadius: 5,
                        padding: '2px 8px',
                    }}
                >
                    {badge.label}
                </span>
                <button
                    onClick={onClose}
                    aria-label="패널 닫기"
                    style={{
                        appearance: 'none',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--sm-text-6)',
                        display: 'flex',
                        alignItems: 'center',
                        padding: 2,
                        marginLeft: 'auto',
                    }}
                >
                    <X size={14} />
                </button>
            </div>

            <div
                style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: 14,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: dc, flexShrink: 0 }} />
                    <span
                        title={device.name}
                        style={{
                            fontFamily: "'Geist Mono',monospace",
                            fontSize: 12,
                            color: 'var(--sm-text)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                        }}
                    >
                        {device.name}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--sm-text-6)', flexShrink: 0 }}>{user.name}</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <span style={labelStyle}>Target</span>
                    <div style={{ display: 'flex', gap: 6 }}>
                        {(['device', 'user'] as const).map(t => (
                            <button
                                key={t}
                                onClick={() => selectTarget(t)}
                                style={{
                                    appearance: 'none',
                                    cursor: 'pointer',
                                    fontFamily: 'inherit',
                                    fontSize: 11,
                                    fontWeight: 600,
                                    borderRadius: 6,
                                    padding: '4px 12px',
                                    background: targetType === t ? hexToRgba(ACCENT, 0.14) : 'var(--sm-panel-2)',
                                    border: `1px solid ${targetType === t ? hexToRgba(ACCENT, 0.4) : 'var(--sm-border-2)'}`,
                                    color: targetType === t ? ACCENT : 'var(--sm-text-5)',
                                }}
                            >
                                {t}
                            </button>
                        ))}
                    </div>
                    <input
                        value={targetId}
                        onChange={e => setTargetId(e.target.value)}
                        onKeyDown={sendOnEnter}
                        style={fieldStyle}
                    />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <span style={labelStyle}>Event Type</span>
                    <input
                        value={eventType}
                        onChange={e => setEventType(e.target.value)}
                        onKeyDown={sendOnEnter}
                        style={fieldStyle}
                    />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <span style={labelStyle}>Data (JSON)</span>
                    <textarea
                        value={dataText}
                        onChange={e => setDataText(e.target.value)}
                        rows={4}
                        spellCheck={false}
                        style={{ ...fieldStyle, resize: 'vertical', lineHeight: 1.5 }}
                    />
                    {dataParsed.error ? (
                        <span style={{ fontSize: 11, color: '#e5484d' }}>JSON 오류: {dataParsed.error}</span>
                    ) : null}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={labelStyle}>push$</span>
                        <Toggle on={pushOn} onChange={setPushOn} label="PUSH" />
                    </div>
                    {pushOn ? (
                        <>
                            <div style={{ display: 'flex', gap: 6 }}>
                                {(['simple', 'json'] as const).map(m => (
                                    <button
                                        key={m}
                                        onClick={() => selectPushMode(m)}
                                        style={{
                                            appearance: 'none',
                                            cursor: 'pointer',
                                            fontFamily: 'inherit',
                                            fontSize: 11,
                                            fontWeight: 600,
                                            borderRadius: 6,
                                            padding: '4px 12px',
                                            background: pushMode === m ? hexToRgba(ACCENT, 0.14) : 'var(--sm-panel-2)',
                                            border: `1px solid ${pushMode === m ? hexToRgba(ACCENT, 0.4) : 'var(--sm-border-2)'}`,
                                            color: pushMode === m ? ACCENT : 'var(--sm-text-5)',
                                        }}
                                    >
                                        {m === 'simple' ? '간편' : 'JSON'}
                                    </button>
                                ))}
                            </div>
                            {pushMode === 'simple' ? (
                                <>
                                    <input
                                        value={pushSender}
                                        onChange={e => setPushSender(e.target.value)}
                                        onKeyDown={sendOnEnter}
                                        placeholder="발신자 (푸시 제목)"
                                        style={fieldStyle}
                                    />
                                    <input
                                        value={pushContent}
                                        onChange={e => setPushContent(e.target.value)}
                                        onKeyDown={sendOnEnter}
                                        placeholder="컨텐츠 (푸시 본문)"
                                        style={fieldStyle}
                                    />
                                    {!pushContent.trim() ? (
                                        <span style={{ fontSize: 11, color: '#d29922' }}>
                                            컨텐츠를 입력해야 전송할 수 있습니다
                                        </span>
                                    ) : null}
                                </>
                            ) : (
                                <>
                                    <textarea
                                        value={pushText}
                                        onChange={e => setPushText(e.target.value)}
                                        rows={8}
                                        spellCheck={false}
                                        style={{ ...fieldStyle, resize: 'vertical', lineHeight: 1.5 }}
                                    />
                                    {pushParsed.error ? (
                                        <span style={{ fontSize: 11, color: '#e5484d' }}>
                                            JSON 오류: {pushParsed.error}
                                        </span>
                                    ) : null}
                                    {pushShapeError ? (
                                        <span style={{ fontSize: 11, color: '#e5484d' }}>{pushShapeError}</span>
                                    ) : null}
                                </>
                            )}
                        </>
                    ) : null}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={labelStyle}>viewing$</span>
                        <Toggle on={viewingOn} onChange={setViewingOn} label="VIEWING" />
                    </div>
                    {viewingOn ? (
                        <>
                            <input
                                value={viewingId}
                                onChange={e => setViewingId(e.target.value)}
                                onKeyDown={sendOnEnter}
                                placeholder="채널 ID (보고 있는 디바이스는 push 억제)"
                                style={fieldStyle}
                            />
                            {!viewingId.trim() ? (
                                <span style={{ fontSize: 11, color: '#d29922' }}>
                                    채널 ID를 입력해야 전송할 수 있습니다
                                </span>
                            ) : null}
                        </>
                    ) : null}
                </div>

                {result ? (
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            padding: '10px 12px',
                            borderRadius: 8,
                            background: hexToRgba(result.value.sent ? '#3fb950' : '#e5484d', 0.08),
                            border: `1px solid ${hexToRgba(result.value.sent ? '#3fb950' : '#e5484d', 0.25)}`,
                        }}
                    >
                        <span
                            style={{
                                fontSize: 10,
                                fontWeight: 700,
                                letterSpacing: '.05em',
                                color: result.value.sent ? '#3fb950' : '#e5484d',
                            }}
                            title="sent = 어느 leg로든 1회 이상 전달"
                        >
                            {result.value.sent ? 'SENT' : 'NOT SENT'}
                        </span>
                        <span
                            style={{ fontFamily: "'Geist Mono',monospace", fontSize: 11, color: 'var(--sm-text-3)' }}
                            title="ws=WS 전달 성공 수 · push=push leg 전달 수 · missing=어느 leg로도 못 받은 대상 수"
                        >
                            ws {result.value.ws} · push {result.value.push} · missing {result.value.missing}
                        </span>
                        <span
                            style={{
                                fontFamily: "'Geist Mono',monospace",
                                fontSize: 10.5,
                                color: 'var(--sm-text-6)',
                                marginLeft: 'auto',
                            }}
                        >
                            {new Date(result.at).toLocaleTimeString('en-GB')}
                        </span>
                    </div>
                ) : null}
                {error ? <span style={{ fontSize: 11.5, color: '#e5484d' }}>전송 실패: {error}</span> : null}
            </div>

            <div
                style={{
                    padding: 14,
                    borderTop: '1px solid var(--sm-border)',
                    flexShrink: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                }}
            >
                {wsOnlyBlocked ? (
                    <span style={{ fontSize: 11, color: '#d29922' }}>
                        red(단절) 디바이스는 WS 수신 불가 — PUSH를 켜야 전송할 수 있습니다
                    </span>
                ) : null}
                <button
                    onClick={send}
                    disabled={!canSend}
                    style={{
                        appearance: 'none',
                        cursor: canSend ? 'pointer' : 'default',
                        width: '100%',
                        fontFamily: 'inherit',
                        fontSize: 12.5,
                        fontWeight: 600,
                        borderRadius: 8,
                        padding: '10px 0',
                        background: canSend ? ACCENT : 'var(--sm-panel-2)',
                        border: 'none',
                        color: canSend ? 'var(--sm-bg)' : 'var(--sm-text-6)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 7,
                    }}
                >
                    <Send size={13} />
                    {sending ? '전송 중…' : '전송'}
                </button>
            </div>
        </div>
    );
}
