import { useState } from 'react';

import { BRIDGE_VERSION_INFO, isNative, webClient } from '@chatic/bridges';
import type { WebMessageData, WebMessageType } from '@chatic/bridge-messages';

import { Row } from '../../components/Row';
import { Section } from '../../components/Section';
import { useBridgeScreenStrings } from '../../i18n/screens/BridgeScreen';

const PRESETS = ['Ping', 'WebAppReady', 'FetchBootRecords', 'FetchCustomZipStatus', 'OpenSubWebView'] as const;

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

const asMessage = (type: string, data: unknown) => ({ type, data }) as unknown as WebMessageData<WebMessageType>;

export const BridgeScreen = () => {
    const strings = useBridgeScreenStrings();
    const [type, setType] = useState<string>('Ping');
    const [payload, setPayload] = useState('{}');
    const [payloadError, setPayloadError] = useState<string | null>(null);
    const [logs, setLogs] = useState<CallLog[]>([]);
    const [busy, setBusy] = useState(false);

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
            webClient.post(asMessage(type, data));
            appendLog({ mode, type, ms: null, ok: true, body: strings.sentNoConfirmation });
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
            <p className="text-[13px] text-muted-foreground">{strings.intro}</p>

            <Section title={strings.channelsSection}>
                <Row label="isNative()" value={String(isNative())} />
                {Object.entries(channels).map(([name, present]) => (
                    <Row key={name} label={name} value={present ? strings.channelPresent : strings.channelAbsent} />
                ))}
                <Row label="bridge" value={BRIDGE_VERSION_INFO.bridgeVersion} />
                <Row label="protocol" value={BRIDGE_VERSION_INFO.protocolVersion} />
            </Section>

            <Section title={strings.commandSection}>
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
                    <span className="text-[13px] font-semibold text-foreground">{strings.typeLabel}</span>
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
                {payloadError && (
                    <p className="text-[12px] text-destructive">{strings.payloadParseFailed(payloadError)}</p>
                )}

                <div className="flex flex-wrap gap-2 pt-1">
                    <button
                        type="button"
                        disabled={busy || !type.trim()}
                        onClick={() => void send('request')}
                        className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-50"
                    >
                        {strings.requestButton}
                    </button>
                    <button
                        type="button"
                        disabled={!type.trim()}
                        onClick={() => void send('post')}
                        className="rounded-md border border-border px-3 py-1.5 text-xs disabled:opacity-50"
                    >
                        {strings.postButton}
                    </button>
                    <button
                        type="button"
                        disabled={logs.length === 0}
                        onClick={() => setLogs([])}
                        className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground disabled:opacity-50"
                    >
                        {strings.clear}
                    </button>
                </div>
            </Section>

            <Section title={strings.exchangeLog(logs.length)}>
                {logs.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{strings.noCommandsSentYet}</p>
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
