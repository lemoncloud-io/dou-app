import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

import { runtime } from '@chatic/app-runtime';
import { Button } from '@chatic/ui-kit/components/ui/button';

import { useSelectedChannelStore, useSocketFrameLogStore, VersionInfo } from '../../../shared';

/**
 * Dev-only socket + cache health page, written to be read at a glance:
 * a plain-language summary up top, then the live socket feed, the persisted
 * cache (IndexedDB), and a restart-survival check.
 */

const DB_NAME = 'ChaticWebCacheDB';
const STORE = 'cache_store';
const BASELINE_KEY = '__dou_debug_sync_baseline';
const ROW_CAP = 300;

const TYPE_LABEL: Record<string, string> = {
    chat: 'Message',
    channel: 'Channel',
    join: 'Member',
    user: 'User',
    site: 'Place',
    profile: 'Profile',
    invitecloud: 'Invite',
};

const FRAME_LABEL: Record<string, string> = {
    'chat.send': '💬 New message',
    'chat.feed': '📥 Message sync',
    'chat.update': '✏️ Message edited',
    'chat.delete': '🗑️ Message deleted',
    'channel.create': '➕ Channel created',
    'channel.update': '📂 Channel changed',
    'channel.sync': '🔄 Channel sync',
    'join.update': '👁️ Read/member change',
    'user.read': '👁️ Read receipt',
    'user.update': '🙍 User changed',
    'auth.update': '🔑 Auth refresh',
    'sync.update': '🔄 Sync',
    'system.ping': '📡 Connection check',
    'system.info': 'ℹ️ Server info',
};

const frameLabel = (domain: string, action: string): string =>
    FRAME_LABEL[`${domain}.${action}`] ?? `${domain}${action ? ` · ${action}` : ''}`;

interface RawRow {
    key: string;
    type: string;
    cid: string;
    uid: string;
    id: string;
    channel_id?: string;
    chat_no?: number;
    data?: unknown;
}

interface GapReport {
    min: number | null;
    max: number | null;
    count: number;
    missing: number;
    ranges: string[];
}

interface Baseline {
    totalRows: number;
    totalChats: number;
    channelId: string | null;
    capturedAt: number;
}

const openDb = (): Promise<IDBDatabase> =>
    new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });

const readAllRows = async (): Promise<RawRow[]> => {
    const db = await openDb();
    try {
        if (!db.objectStoreNames.contains(STORE)) return [];
        return await new Promise<RawRow[]>((resolve, reject) => {
            const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
            req.onsuccess = () => resolve((req.result as RawRow[]) ?? []);
            req.onerror = () => reject(req.error);
        });
    } finally {
        db.close();
    }
};

const deleteKeys = async (keys: string[]): Promise<void> => {
    if (keys.length === 0) return;
    const db = await openDb();
    try {
        if (!db.objectStoreNames.contains(STORE)) return;
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(STORE, 'readwrite');
            const store = tx.objectStore(STORE);
            keys.forEach(k => store.delete(k));
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    } finally {
        db.close();
    }
};

const computeGaps = (input: number[]): GapReport => {
    const nos = [...new Set(input)].sort((a, b) => a - b);
    if (nos.length === 0) return { min: null, max: null, count: 0, missing: 0, ranges: [] };
    const ranges: string[] = [];
    let missing = 0;
    for (let i = 1; i < nos.length; i++) {
        const lo = nos[i - 1] + 1;
        const hi = nos[i] - 1;
        if (hi >= lo) {
            missing += hi - lo + 1;
            ranges.push(lo === hi ? `${lo}` : `${lo}–${hi}`);
        }
    }
    return { min: nos[0], max: nos[nos.length - 1], count: nos.length, missing, ranges };
};

const readBaseline = (): Baseline | null => {
    try {
        const raw = localStorage.getItem(BASELINE_KEY);
        return raw ? (JSON.parse(raw) as Baseline) : null;
    } catch {
        return null;
    }
};

const fmtTime = (ts: number) => new Date(ts).toLocaleTimeString();

const Section = ({
    title,
    hint,
    action,
    children,
}: {
    title: string;
    hint?: string;
    action?: ReactNode;
    children: ReactNode;
}) => (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
        <div className="mb-2 flex items-start justify-between gap-2">
            <div>
                <p className="text-sm font-semibold text-foreground">{title}</p>
                {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
            </div>
            {action}
        </div>
        {children}
    </div>
);

const Stat = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
    <div className="rounded-lg border border-border/60 bg-background px-3 py-2">
        <p className="text-nano uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-sm font-semibold text-foreground">{value}</p>
        {sub && <p className="truncate text-tiny text-muted-foreground">{sub}</p>}
    </div>
);

/** Plain-language summary: is sync healthy right now? */
const HealthCard = ({
    socket,
    totalRows,
    typeText,
    frameCount,
    gapText,
}: {
    socket: { dot: string; text: string };
    totalRows: number;
    typeText: string;
    frameCount: number;
    gapText: string;
}) => (
    <div className="rounded-xl border border-border bg-card p-4">
        <p className="mb-3 text-sm font-semibold text-foreground">At a glance</p>
        <div className="grid grid-cols-2 gap-3">
            <Stat label="Socket" value={`${socket.dot} ${socket.text}`} />
            <Stat label="Received this session" value={`${frameCount} ${frameCount === 1 ? 'frame' : 'frames'}`} />
            <Stat label="Cached rows" value={`${totalRows}`} sub={typeText} />
            <Stat label="Missing messages" value={gapText} />
        </div>
    </div>
);

/** Live, human-readable feed of inbound socket frames (newest first). */
const SocketFrameLog = () => {
    const frames = useSocketFrameLogStore(s => s.frames);
    const paused = useSocketFrameLogStore(s => s.paused);
    const setPaused = useSocketFrameLogStore(s => s.setPaused);
    const clear = useSocketFrameLogStore(s => s.clear);
    const [openSeq, setOpenSeq] = useState<number | null>(null);

    return (
        <Section
            title={`Live socket feed (${frames.length})`}
            hint="Data that just arrived from the server. Click a row to see the raw JSON."
            action={
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setPaused(!paused)}>
                        {paused ? 'Resume' : 'Pause'}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={clear}>
                        Clear
                    </Button>
                </div>
            }
        >
            <div className="max-h-72 divide-y divide-border/60 overflow-y-auto">
                {frames.length === 0 && <p className="py-3 text-sm text-muted-foreground">No data received yet…</p>}
                {frames.map(f => (
                    <div key={f.seq} className="py-1.5">
                        <button
                            type="button"
                            onClick={() => setOpenSeq(openSeq === f.seq ? null : f.seq)}
                            className="flex w-full items-baseline gap-2 text-left text-xs"
                        >
                            <span className="font-mono text-muted-foreground">{fmtTime(f.at)}</span>
                            <span className="font-medium text-foreground">{frameLabel(f.domain, f.action)}</span>
                            {f.chatNo !== null && <span className="font-mono text-amber-600">#{f.chatNo}</span>}
                        </button>
                        {openSeq === f.seq && (
                            <pre className="mt-1 max-h-60 overflow-auto rounded bg-muted p-2 text-nano leading-snug text-foreground">
                                {JSON.stringify(f.raw, null, 2)}
                            </pre>
                        )}
                    </div>
                ))}
            </div>
        </Section>
    );
};

/** Presentational browser over persisted rows (data supplied by the page). */
const CacheExplorer = ({
    rows,
    loading,
    refresh,
    channelId,
    gap,
}: {
    rows: RawRow[];
    loading: boolean;
    refresh: () => void;
    channelId: string | null;
    gap: GapReport | null;
}) => {
    const [typeFilter, setTypeFilter] = useState('all');
    const [text, setText] = useState('');
    const [openKey, setOpenKey] = useState<string | null>(null);

    const types = useMemo(() => ['all', ...new Set(rows.map(r => r.type))].sort(), [rows]);
    const filtered = useMemo(() => {
        const q = text.trim().toLowerCase();
        return rows
            .filter(r => typeFilter === 'all' || r.type === typeFilter)
            .filter(
                r =>
                    !q ||
                    r.id?.toLowerCase().includes(q) ||
                    r.channel_id?.toLowerCase().includes(q) ||
                    r.key?.toLowerCase().includes(q)
            )
            .slice(0, ROW_CAP);
    }, [rows, typeFilter, text]);

    return (
        <Section
            title={`Cached rows (${filtered.length}/${rows.length})`}
            hint="Records actually stored on this device (IndexedDB). Click a row to see its content."
            action={
                <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
                    {loading ? 'Loading…' : 'Refresh'}
                </Button>
            }
        >
            <div className="mb-2 flex flex-wrap items-center gap-2">
                <select
                    value={typeFilter}
                    onChange={e => setTypeFilter(e.target.value)}
                    className="rounded border border-border bg-background px-2 py-1 text-xs"
                >
                    {types.map(t => (
                        <option key={t} value={t}>
                            {t === 'all' ? 'All' : `${TYPE_LABEL[t] ?? t} (${t})`}
                        </option>
                    ))}
                </select>
                <input
                    value={text}
                    onChange={e => setText(e.target.value)}
                    placeholder="Search by id / channel / key"
                    className="flex-1 rounded border border-border bg-background px-2 py-1 text-xs"
                />
            </div>

            {channelId && gap && (
                <div
                    className={`mb-2 rounded-lg px-3 py-2 text-xs ${
                        gap.missing > 0
                            ? 'bg-red-500/15 text-red-600 dark:text-red-400'
                            : 'bg-green-500/15 text-green-600 dark:text-green-400'
                    }`}
                >
                    <span className="font-semibold">
                        {gap.missing > 0
                            ? `⚠️ ${gap.missing} ${gap.missing === 1 ? 'message' : 'messages'} missing`
                            : '✅ No gaps'}
                    </span>{' '}
                    <span className="text-muted-foreground">
                        (open channel, {gap.count} stored · range {gap.min ?? '—'}…{gap.max ?? '—'})
                    </span>
                    {gap.ranges.length > 0 && (
                        <div className="mt-1 font-mono text-nano">Missing numbers: {gap.ranges.join(', ')}</div>
                    )}
                </div>
            )}

            <div className="max-h-72 divide-y divide-border/60 overflow-y-auto">
                {filtered.map(r => (
                    <div key={r.key} className="py-1.5">
                        <button
                            type="button"
                            onClick={() => setOpenKey(openKey === r.key ? null : r.key)}
                            className="flex w-full items-baseline gap-2 text-left text-xs"
                        >
                            <span className="font-medium text-primary">{TYPE_LABEL[r.type] ?? r.type}</span>
                            {r.chat_no !== undefined && <span className="font-mono text-amber-600">#{r.chat_no}</span>}
                            <span className="truncate font-mono text-foreground">{r.id}</span>
                        </button>
                        {openKey === r.key && (
                            <pre className="mt-1 max-h-60 overflow-auto rounded bg-muted p-2 text-nano leading-snug text-foreground">
                                {JSON.stringify(r.data, null, 2)}
                            </pre>
                        )}
                    </div>
                ))}
            </div>
        </Section>
    );
};

export const DebugSyncPage = () => {
    const navigate = useNavigate();
    const { isConnected, isVerified } = runtime.connection.useRuntimeSocketState();
    const selectedChannelId = useSelectedChannelStore(s => s.selectedChannelId);
    const frameCount = useSocketFrameLogStore(s => s.frames.length);

    const [rows, setRows] = useState<RawRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [baseline] = useState<Baseline | null>(() => readBaseline());

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            setRows(await readAllRows());
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const typeTotals = useMemo(() => {
        const by: Record<string, number> = {};
        for (const r of rows) by[r.type] = (by[r.type] ?? 0) + 1;
        return by;
    }, [rows]);

    const gap = useMemo(() => {
        if (!selectedChannelId) return null;
        const nos = rows
            .filter(r => r.type === 'chat' && r.channel_id === selectedChannelId && r.chat_no !== undefined)
            .map(r => r.chat_no as number);
        return computeGaps(nos);
    }, [rows, selectedChannelId]);

    const totalChats = typeTotals.chat ?? 0;
    const socket = isConnected
        ? isVerified
            ? { dot: '🟢', text: 'Connected · verified' }
            : { dot: '🟡', text: 'Connected · verifying' }
        : { dot: '🔴', text: 'Disconnected' };
    const typeText = Object.entries(typeTotals)
        .sort((a, b) => b[1] - a[1])
        .map(([t, n]) => `${TYPE_LABEL[t] ?? t} ${n}`)
        .join(' · ');
    const gapText = !selectedChannelId
        ? 'Opens a channel to check'
        : gap && gap.missing > 0
          ? `⚠️ ${gap.missing} missing`
          : '✅ No gaps';

    const debugRows = useMemo(() => rows.filter(r => typeof r.id === 'string' && r.id.startsWith('debug-')), [rows]);

    const purgeDebugData = useCallback(async () => {
        await deleteKeys(debugRows.map(r => r.key));
        await refresh();
    }, [debugRows, refresh]);

    const captureBaseline = useCallback(() => {
        const b: Baseline = {
            totalRows: rows.length,
            totalChats: rows.filter(r => r.type === 'chat').length,
            channelId: selectedChannelId,
            capturedAt: Date.now(),
        };
        localStorage.setItem(BASELINE_KEY, JSON.stringify(b));
        navigate(0);
    }, [rows, selectedChannelId, navigate]);

    const survival = baseline ? rows.length >= baseline.totalRows && totalChats >= baseline.totalChats : null;

    return (
        <div className="mx-auto w-full max-w-4xl p-6">
            <div className="mb-4 flex items-start justify-between">
                <div>
                    <h1 className="text-base font-semibold text-foreground">Socket / Cache</h1>
                    <p className="text-xs text-muted-foreground">
                        Check live socket traffic and the local cache (IndexedDB) status.
                    </p>
                </div>
                <VersionInfo className="text-right" />
            </div>

            <div className="flex w-full flex-col gap-4">
                <HealthCard
                    socket={socket}
                    totalRows={rows.length}
                    typeText={typeText || 'Empty'}
                    frameCount={frameCount}
                    gapText={gapText}
                />

                <SocketFrameLog />

                <CacheExplorer
                    rows={rows}
                    loading={loading}
                    refresh={() => void refresh()}
                    channelId={selectedChannelId}
                    gap={gap}
                />

                <Section
                    title="Does it survive a restart?"
                    hint="Save the current cache as a baseline, then refresh — it automatically compares whether the data survived."
                >
                    {baseline ? (
                        <div
                            className={`mb-2 rounded-lg px-3 py-2 text-sm font-semibold ${
                                survival
                                    ? 'bg-green-500/15 text-green-600 dark:text-green-400'
                                    : 'bg-red-500/15 text-red-600 dark:text-red-400'
                            }`}
                        >
                            {survival ? '✅ Passed — cache survived the restart' : '❌ Failed — cache shrank'}
                            <span className="ml-2 font-normal text-muted-foreground">
                                (saved {baseline.totalRows} → now {rows.length}, baseline {fmtTime(baseline.capturedAt)}
                                )
                            </span>
                        </div>
                    ) : (
                        <p className="mb-2 text-xs text-muted-foreground">
                            Open a channel, receive a message, then use “Save baseline → Refresh” to check whether the
                            cache persists.
                        </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                        <Button size="sm" onClick={captureBaseline}>
                            Save baseline
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => navigate(0)}>
                            Refresh
                        </Button>
                        {baseline && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                    localStorage.removeItem(BASELINE_KEY);
                                    navigate(0);
                                }}
                            >
                                Clear baseline
                            </Button>
                        )}
                    </div>
                </Section>

                <Section
                    title="Clean up debug data"
                    hint="Clears the fake records (channels/messages) created in the “Cache write playground” tab in one go. Use it to remove [sample] messages mixed into real chats."
                >
                    <div className="flex items-center justify-between gap-3">
                        <span className="text-sm text-muted-foreground">
                            {debugRows.length > 0
                                ? `Found ${debugRows.length} debug records`
                                : 'Clean (no debug records)'}
                        </span>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void purgeDebugData()}
                            disabled={debugRows.length === 0}
                        >
                            Clean up
                        </Button>
                    </div>
                </Section>
            </div>
        </div>
    );
};
