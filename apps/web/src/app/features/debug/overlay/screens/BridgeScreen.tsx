import { useState } from 'react';

import { BRIDGE_VERSION_INFO, isNative, webClient } from '@chatic/bridges';
import type { WebMessageData, WebMessageType } from '@chatic/app-messages';

import { Row } from '../../components/Row';
import { Section } from '../../components/Section';

/**
 * The bridge itself, which no screen covered: every other native screen exercises ONE command and,
 * when it fails, cannot say whether the command is wrong, the app build is old, or the channel was
 * never there. This one answers that question first — which injection channel exists, what protocol
 * version this web speaks — and then lets any command be sent by hand.
 *
 * Ping/Pong is the round-trip check: it carries no meaning of its own, so a reply proves the channel
 * and the measured time is the channel's real latency.
 */

/** Kept to a handful: enough to answer "does the channel work" without hunting for a safe command. */
const PRESETS = ['Ping', 'WebAppReady', 'FetchBootRecords', 'FetchCustomZipStatus'] as const;

interface CallLog {
    id: number;
    mode: 'request' | 'post';
    type: string;
    ms: number | null;
    ok: boolean;
    body: string;
}

const MAX_LOGS = 20;
const MAX_BODY_CHARS = 400;

/** Free-typed commands cannot be proven to match a message type; the bridge validates at runtime. */
const asMessage = (type: string, data: unknown) => ({ type, data }) as unknown as WebMessageData<WebMessageType>;

export const BridgeScreen = () => {
    const [type, setType] = useState<string>('Ping');
    const [payload, setPayload] = useState('{}');
    const [payloadError, setPayloadError] = useState<string | null>(null);
    const [logs, setLogs] = useState<CallLog[]>([]);
    const [busy, setBusy] = useState(false);

    // Read at render: the channel can appear late (the client polls for it), so a remount reflects it.
    const channels = {
        'RN WebView': !!window.ReactNativeWebView?.postMessage,
        'Chatic handler': !!window.ChaticMessageHandler?.postMessage,
        'webkit handler': !!window.webkit?.messageHandlers?.ChaticMessageHandler?.postMessage,
    };

    const appendLog = (log: Omit<CallLog, 'id'>) =>
        setLogs(current => [{ id: Date.now() + Math.random(), ...log }, ...current].slice(0, MAX_LOGS));

    const parsePayload = (): unknown | undefined => {
        try {
            const parsed = JSON.parse(payload || '{}');
            setPayloadError(null);
            return parsed;
        } catch (e) {
            setPayloadError((e as Error).message);
            return undefined;
        }
    };

    const send = async (mode: 'request' | 'post') => {
        const data = parsePayload();
        if (data === undefined) return;

        const startedAt = performance.now();
        if (mode === 'post') {
            // Nothing comes back, so the line says so rather than implying the app acted.
            webClient.post(asMessage(type, data));
            appendLog({ mode, type, ms: null, ok: true, body: '보냄 (확인 없음)' });
            return;
        }

        setBusy(true);
        try {
            const response = await webClient.request(asMessage(type, data));
            appendLog({
                mode,
                type,
                ms: Math.round(performance.now() - startedAt),
                ok: true,
                body: JSON.stringify(response?.data ?? response ?? {}).slice(0, MAX_BODY_CHARS),
            });
        } catch (e) {
            const error = e as { code?: string; message?: string };
            appendLog({
                mode,
                type,
                ms: Math.round(performance.now() - startedAt),
                ok: false,
                body: `${error.code ?? 'ERROR'}: ${error.message ?? String(e)}`,
            });
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="flex flex-col gap-4 p-4">
            <p className="text-[13px] text-muted-foreground">
                채널이 붙어 있는지 먼저 보고, 아무 명령이나 손으로 보냅니다
            </p>

            <Section title="채널">
                <Row label="isNative()" value={String(isNative())} />
                {Object.entries(channels).map(([name, present]) => (
                    <Row key={name} label={name} value={present ? '있음' : '없음'} />
                ))}
                <Row label="bridge" value={BRIDGE_VERSION_INFO.bridgeVersion} />
                <Row label="protocol" value={BRIDGE_VERSION_INFO.protocolVersion} />
            </Section>

            <Section title="명령">
                <div className="flex flex-wrap gap-1.5 pt-1">
                    {PRESETS.map(preset => (
                        <button
                            key={preset}
                            type="button"
                            onClick={() => setType(preset)}
                            className={`rounded-full border px-2.5 py-1 text-[11px] ${
                                type === preset
                                    ? 'border-foreground bg-foreground text-background'
                                    : 'border-border text-muted-foreground'
                            }`}
                        >
                            {preset}
                        </button>
                    ))}
                </div>

                <label className="mt-2 flex flex-col gap-1.5">
                    <span className="text-[13px] font-semibold text-foreground">타입</span>
                    <input
                        type="text"
                        value={type}
                        onChange={e => setType(e.target.value)}
                        placeholder="Ping"
                        className="w-full rounded-xl border border-border bg-background px-3 py-2 font-mono text-[13px] outline-none focus:border-foreground"
                    />
                </label>

                <label className="flex flex-col gap-1.5">
                    <span className="text-[13px] font-semibold text-foreground">payload (JSON)</span>
                    <textarea
                        value={payload}
                        onChange={e => setPayload(e.target.value)}
                        rows={3}
                        spellCheck={false}
                        className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 font-mono text-[12px] outline-none focus:border-foreground"
                    />
                </label>
                {payloadError && <p className="text-[12px] text-destructive">payload 파싱 실패: {payloadError}</p>}

                <div className="flex flex-wrap gap-2 pt-1">
                    <button
                        type="button"
                        disabled={busy || !type.trim()}
                        onClick={() => void send('request')}
                        className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-50"
                    >
                        request (응답 대기)
                    </button>
                    <button
                        type="button"
                        disabled={!type.trim()}
                        onClick={() => void send('post')}
                        className="rounded-md border border-border px-3 py-1.5 text-xs disabled:opacity-50"
                    >
                        post (일방향)
                    </button>
                    <button
                        type="button"
                        disabled={logs.length === 0}
                        onClick={() => setLogs([])}
                        className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground disabled:opacity-50"
                    >
                        비우기
                    </button>
                </div>
            </Section>

            <Section title={`주고받은 기록 (${logs.length})`}>
                {logs.length === 0 ? (
                    <p className="text-xs text-muted-foreground">아직 보낸 명령이 없습니다</p>
                ) : (
                    <ul className="flex flex-col gap-1.5">
                        {logs.map(log => (
                            <li key={log.id} className="rounded-lg border border-border px-2.5 py-2">
                                <div className="flex items-center gap-2 text-[11px]">
                                    <span
                                        className={`rounded px-1.5 py-0.5 font-mono ${
                                            log.ok
                                                ? 'bg-muted text-muted-foreground'
                                                : 'bg-destructive/10 text-destructive'
                                        }`}
                                    >
                                        {log.mode}
                                    </span>
                                    <span className="font-mono font-semibold">{log.type}</span>
                                    <span className="ml-auto text-muted-foreground">
                                        {log.ms != null ? `${log.ms} ms` : '—'}
                                    </span>
                                </div>
                                <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">{log.body}</p>
                            </li>
                        ))}
                    </ul>
                )}
            </Section>
        </div>
    );
};
