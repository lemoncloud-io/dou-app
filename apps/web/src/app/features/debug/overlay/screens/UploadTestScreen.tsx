import { Activity, FilePlus2, FileText, Inbox, RefreshCw, Trash2, Upload, XCircle } from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { OnFileTransferStatePayload } from '@chatic/app-messages';
import { webClient } from '@chatic/bridges';

/**
 * Drives the native file-transfer module against the local S3 stand-in
 * (`node scripts/upload-test-server.js`). The scenario is part of the URL, so each run only changes
 * where the transfer points: success, an expired signature, an existing key, a slow link, or a
 * dropped connection.
 */

type LogLevel = 'info' | 'success' | 'warning' | 'error';

interface LogEntry {
    id: string;
    level: LogLevel;
    label: string;
    message: string;
    timestamp: string;
}

interface StagedFile {
    uri: string;
    name: string;
    type: string;
    size: number;
}

type Scenario = 'ok' | 'expired' | 'exists' | 'slow' | 'drop';

const SCENARIOS: Scenario[] = ['ok', 'expired', 'exists', 'slow', 'drop'];

const TERMINAL = new Set<OnFileTransferStatePayload['state']>(['responded', 'failed', 'cancelled']);

const Section = ({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) => (
    <section className="min-w-0 max-w-full overflow-hidden rounded-[20px] bg-card px-5 py-4 shadow-[0px_4px_20px_0px_rgba(0,0,0,0.04)] border border-border/40 dark:border-border dark:shadow-none">
        <div className="mb-3.5 flex items-center justify-between">
            <p className="text-[11px] font-extrabold uppercase tracking-widest text-primary/90">{title}</p>
            {action}
        </div>
        {children}
    </section>
);

const ActionButton = ({
    icon,
    label,
    onClick,
    tone = 'default',
    disabled,
}: {
    icon: ReactNode;
    label: string;
    onClick: () => void;
    tone?: 'default' | 'primary' | 'danger' | 'ghost';
    disabled?: boolean;
}) => {
    const toneClassName =
        tone === 'primary'
            ? 'bg-primary text-primary-foreground border-primary hover:bg-primary/95'
            : tone === 'danger'
              ? 'border-destructive/25 bg-destructive/10 text-destructive hover:bg-destructive/20'
              : tone === 'ghost'
                ? 'border-transparent bg-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                : 'border-border bg-background text-foreground hover:bg-muted/50';

    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={`flex min-h-[40px] items-center justify-center gap-2 rounded-[12px] border px-4 text-[13px] font-bold disabled:opacity-40 disabled:pointer-events-none transition-all duration-200 active:scale-[0.98] ${toneClassName}`}
        >
            {icon}
            <span>{label}</span>
        </button>
    );
};

const levelClassName: Record<LogLevel, string> = {
    info: 'bg-muted text-muted-foreground',
    success: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    warning: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
    error: 'bg-destructive/15 text-destructive',
};

const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
};

/** Reads the error code a rejected bridge request carries; `NOT_FOUND` means the installed shell predates these messages. */
const errorOf = (e: unknown) => {
    const code = (e as { code?: string })?.code ?? 'UNKNOWN';
    const message = (e as { message?: string })?.message ?? String(e);
    return code === 'NOT_FOUND' ? `${code} — this app build has no file-transfer handler yet` : `${code} — ${message}`;
};

const summarize = (t: OnFileTransferStatePayload) => {
    if (t.state === 'responded') return `HTTP ${t.httpStatus}${t.providerCode ? ` · ${t.providerCode}` : ''}`;
    if (t.state === 'failed') return `${t.errorCode}${t.errorMessage ? ` · ${t.errorMessage}` : ''}`;
    return t.state;
};

/**
 * The test server runs beside the web dev server, so the host this page was loaded from reaches
 * it: `localhost` on a simulator or an emulator (through `adb reverse`), the machine's LAN address
 * on a real device.
 */
const defaultTestServer = () => `http://${window.location.hostname || 'localhost'}:8080`;

/**
 * Not `crypto.randomUUID`: it exists only in a secure context, and a real device loads the dev
 * server over plain http from a LAN address. `getRandomValues` has no such limit.
 */
const newTransferId = () =>
    Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');

export const UploadTestScreen = () => {
    const [baseUrl, setBaseUrl] = useState(defaultTestServer);
    const [scenario, setScenario] = useState<Scenario>('ok');
    const [slowBps, setSlowBps] = useState(64 * 1024);
    const [dropAfter, setDropAfter] = useState(256 * 1024);

    const [staged, setStaged] = useState<StagedFile[]>([]);
    const [transfers, setTransfers] = useState<Record<string, OnFileTransferStatePayload>>({});
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const logEndRef = useRef<HTMLDivElement | null>(null);

    const isOnMobileApp = useMemo(
        () =>
            typeof window !== 'undefined' &&
            !!(
                window.ReactNativeWebView?.postMessage ||
                window.ChaticMessageHandler?.postMessage ||
                window.webkit?.messageHandlers?.ChaticMessageHandler?.postMessage
            ),
        []
    );

    const addLog = useCallback((level: LogLevel, label: string, message: string) => {
        const timestamp = new Date().toLocaleTimeString('en-GB', { hour12: false });
        setLogs(prev => [...prev, { id: `${Date.now()}-${Math.random()}`, level, label, message, timestamp }]);
    }, []);

    const upsert = useCallback((state: OnFileTransferStatePayload) => {
        setTransfers(prev => ({ ...prev, [state.transferId]: state }));
    }, []);

    // Every state change arrives as one event; terminal ones are logged, running ones only update the row.
    useEffect(() => {
        const unsubscribe = webClient.onEvent('OnFileTransferState', message => {
            const state = message.data;
            if (!state) return;
            upsert(state);
            if (TERMINAL.has(state.state)) {
                const level: LogLevel =
                    state.state === 'failed' ? 'error' : state.state === 'cancelled' ? 'warning' : 'success';
                addLog(level, 'Event', `${state.transferId.slice(0, 8)} ${summarize(state)}`);
            }
        });
        return unsubscribe;
    }, [addLog, upsert]);

    useEffect(() => {
        logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [logs]);

    const targetUrl = useMemo(() => {
        const root = baseUrl.replace(/\/+$/, '');
        if (scenario === 'slow') return `${root}/s3/slow?bps=${slowBps}`;
        if (scenario === 'drop') return `${root}/s3/drop?after=${dropAfter}`;
        return `${root}/s3/${scenario}`;
    }, [baseUrl, scenario, slowBps, dropAfter]);

    const pickFiles = useCallback(async () => {
        try {
            const response = await webClient.request({
                type: 'OpenDocument',
                data: { allowMultiSelection: true, includeBase64: false },
            });
            const documents =
                (
                    response.data as {
                        documents?: { uri: string; name?: string | null; type?: string | null; size?: number | null }[];
                    }
                )?.documents ?? [];
            setStaged(prev => [
                ...prev,
                ...documents.map(doc => ({
                    uri: doc.uri,
                    name: doc.name ?? 'file',
                    type: doc.type ?? 'application/octet-stream',
                    size: doc.size ?? 0,
                })),
            ]);
            addLog('info', 'Picker', `Staged ${documents.length} file(s)`);
        } catch (e) {
            addLog('error', 'Picker', errorOf(e));
        }
    }, [addLog]);

    const stageDummy = useCallback(
        async (sizeInBytes: number) => {
            const fileName = `dummy_${formatBytes(sizeInBytes).replace(/\s/g, '')}_${Math.random().toString(36).slice(2, 6)}.bin`;
            try {
                const response = await webClient.request({ type: 'CreateDummyFile', data: { sizeInBytes, fileName } });
                const doc = response.data;
                if (!doc) throw new Error('no file in the reply');
                setStaged(prev => [
                    ...prev,
                    { uri: doc.uri, name: doc.name, type: 'application/octet-stream', size: doc.size },
                ]);
                addLog('info', 'Generator', `Staged ${doc.name}`);
            } catch (e) {
                addLog('error', 'Generator', errorOf(e));
            }
        },
        [addLog]
    );

    // Exercises the path a resized image takes: bytes that exist only in web memory become a file first.
    const stageFromMemory = useCallback(async () => {
        const bytes = new Uint8Array(32 * 1024).map((_, i) => i % 256);
        const base64 = btoa(String.fromCharCode(...bytes));
        try {
            const response = await webClient.request({
                type: 'WriteTempFile',
                data: { base64, fileName: 'memory.bin' },
            });
            const uri = response.data?.uri;
            if (!uri) throw new Error('no uri in the reply');
            setStaged(prev => [
                ...prev,
                { uri, name: 'memory.bin', type: 'application/octet-stream', size: bytes.length },
            ]);
            addLog('info', 'TempFile', `Wrote ${formatBytes(bytes.length)} from memory`);
        } catch (e) {
            addLog('error', 'TempFile', errorOf(e));
        }
    }, [addLog]);

    const startAll = useCallback(async () => {
        for (const file of staged) {
            const transferId = newTransferId();
            try {
                await webClient.request({
                    type: 'StartFileTransfer',
                    data: {
                        transferId,
                        direction: 'upload',
                        url: targetUrl,
                        method: 'PUT',
                        // content-length is included on purpose: a presigned PUT lists it among the signed
                        // headers, and the shell has to drop it rather than set it twice.
                        headers: { 'content-type': file.type, 'content-length': String(file.size) },
                        file: { uri: file.uri, contentType: file.type, contentLength: file.size },
                        title: file.name,
                    },
                });
                addLog('info', 'Start', `${transferId.slice(0, 8)} ${file.name} → ${scenario}`);
            } catch (e) {
                addLog('error', 'Start', `${file.name}: ${errorOf(e)}`);
            }
        }
        setStaged([]);
    }, [staged, targetUrl, scenario, addLog]);

    const cancel = useCallback(
        async (transferId: string) => {
            try {
                await webClient.request({ type: 'CancelFileTransfer', data: { transferId } });
            } catch (e) {
                addLog('warning', 'Cancel', `${transferId.slice(0, 8)}: ${errorOf(e)}`);
            }
        },
        [addLog]
    );

    const refresh = useCallback(async () => {
        try {
            const response = await webClient.request({ type: 'ListFileTransfers', data: {} });
            const held = response.data?.transfers ?? [];
            held.forEach(upsert);
            addLog('info', 'List', `Native holds ${held.length} transfer(s)`);
        } catch (e) {
            addLog('error', 'List', errorOf(e));
        }
    }, [addLog, upsert]);

    const ackEnded = useCallback(async () => {
        const ended = Object.values(transfers)
            .filter(t => TERMINAL.has(t.state))
            .map(t => t.transferId);
        if (ended.length === 0) return;
        try {
            const response = await webClient.request({ type: 'AckFileTransfers', data: { transferIds: ended } });
            setTransfers(prev => Object.fromEntries(Object.entries(prev).filter(([id]) => !ended.includes(id))));
            addLog(
                'info',
                'Ack',
                `Acknowledged ${ended.length}; native still holds ${response.data?.remaining ?? '?'}`
            );
        } catch (e) {
            addLog('error', 'Ack', errorOf(e));
        }
    }, [transfers, addLog]);

    const rows = Object.values(transfers);

    return (
        <div className="flex min-w-0 flex-col gap-4 p-4">
            {!isOnMobileApp && (
                <p className="rounded-[12px] bg-amber-500/10 px-4 py-3 text-[13px] text-amber-700 dark:text-amber-400">
                    File transfer runs in the native shell only. Open this screen inside the mobile app.
                </p>
            )}

            <Section title="Target">
                <div className="flex flex-col gap-3">
                    <input
                        className="h-10 rounded-[12px] border border-border bg-background px-3 text-[13px]"
                        value={baseUrl}
                        onChange={event => setBaseUrl(event.target.value)}
                        aria-label="Test server base URL"
                    />
                    <div className="flex flex-wrap gap-2">
                        {SCENARIOS.map(value => (
                            <ActionButton
                                key={value}
                                icon={<Activity size={14} />}
                                label={value}
                                tone={value === scenario ? 'primary' : 'default'}
                                onClick={() => setScenario(value)}
                            />
                        ))}
                    </div>
                    {scenario === 'slow' && (
                        <input
                            type="number"
                            className="h-10 rounded-[12px] border border-border bg-background px-3 text-[13px]"
                            value={slowBps}
                            onChange={event => setSlowBps(Number(event.target.value) || 1)}
                            aria-label="Bytes per second"
                        />
                    )}
                    {scenario === 'drop' && (
                        <input
                            type="number"
                            className="h-10 rounded-[12px] border border-border bg-background px-3 text-[13px]"
                            value={dropAfter}
                            onChange={event => setDropAfter(Number(event.target.value) || 0)}
                            aria-label="Drop after bytes"
                        />
                    )}
                    <p className="break-all text-[12px] text-muted-foreground">{targetUrl}</p>
                </div>
            </Section>

            <Section title={`Files (${staged.length})`}>
                <div className="flex flex-wrap gap-2">
                    <ActionButton
                        icon={<FileText size={14} />}
                        label="Pick"
                        onClick={pickFiles}
                        disabled={!isOnMobileApp}
                    />
                    <ActionButton
                        icon={<FilePlus2 size={14} />}
                        label="1 MB"
                        onClick={() => stageDummy(1024 * 1024)}
                        disabled={!isOnMobileApp}
                    />
                    <ActionButton
                        icon={<FilePlus2 size={14} />}
                        label="100 MB"
                        onClick={() => stageDummy(100 * 1024 * 1024)}
                        disabled={!isOnMobileApp}
                    />
                    <ActionButton
                        icon={<FilePlus2 size={14} />}
                        label="From memory"
                        onClick={stageFromMemory}
                        disabled={!isOnMobileApp}
                    />
                    <ActionButton
                        icon={<Upload size={14} />}
                        label="Start"
                        tone="primary"
                        onClick={startAll}
                        disabled={!isOnMobileApp || staged.length === 0}
                    />
                </div>
                {staged.length > 0 && (
                    <ul className="mt-3 flex flex-col gap-1 text-[12px] text-muted-foreground">
                        {staged.map(file => (
                            <li key={file.uri} className="truncate">
                                {file.name} · {formatBytes(file.size)}
                            </li>
                        ))}
                    </ul>
                )}
            </Section>

            <Section
                title={`Transfers (${rows.length})`}
                action={
                    <div className="flex gap-1">
                        <ActionButton
                            icon={<RefreshCw size={14} />}
                            label="List"
                            tone="ghost"
                            onClick={refresh}
                            disabled={!isOnMobileApp}
                        />
                        <ActionButton
                            icon={<Inbox size={14} />}
                            label="Ack ended"
                            tone="ghost"
                            onClick={ackEnded}
                            disabled={!isOnMobileApp}
                        />
                    </div>
                }
            >
                <ul className="flex flex-col gap-2">
                    {rows.map(t => {
                        const percent = t.totalBytes > 0 ? Math.round((t.transferredBytes / t.totalBytes) * 100) : null;
                        return (
                            <li
                                key={t.transferId}
                                className="flex items-center gap-3 rounded-[12px] border border-border px-3 py-2 text-[12px]"
                            >
                                <div className="min-w-0 flex-1">
                                    <p className="truncate font-bold">{t.transferId.slice(0, 8)}</p>
                                    <p className="truncate text-muted-foreground">
                                        {formatBytes(t.transferredBytes)} /{' '}
                                        {t.totalBytes > 0 ? formatBytes(t.totalBytes) : '?'}
                                        {percent !== null ? ` · ${percent}%` : ''} · {summarize(t)}
                                    </p>
                                </div>
                                {t.state === 'running' && (
                                    <ActionButton
                                        icon={<XCircle size={14} />}
                                        label="Cancel"
                                        tone="danger"
                                        onClick={() => cancel(t.transferId)}
                                    />
                                )}
                            </li>
                        );
                    })}
                </ul>
            </Section>

            <Section
                title="Log"
                action={
                    <ActionButton icon={<Trash2 size={14} />} label="Clear" tone="ghost" onClick={() => setLogs([])} />
                }
            >
                <ul className="flex max-h-[320px] flex-col gap-1 overflow-y-auto text-[12px]">
                    {logs.map(entry => (
                        <li key={entry.id} className="flex items-start gap-2">
                            <span className="shrink-0 text-muted-foreground">{entry.timestamp}</span>
                            <span className={`shrink-0 rounded px-1.5 ${levelClassName[entry.level]}`}>
                                {entry.label}
                            </span>
                            <span className="min-w-0 break-all">{entry.message}</span>
                        </li>
                    ))}
                    <div ref={logEndRef} />
                </ul>
            </Section>
        </div>
    );
};
