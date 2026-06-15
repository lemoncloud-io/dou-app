import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

import { useWebCoreStore } from '@chatic/web-core';
import { useWebSocketV2Store } from '@chatic/socket';
import { Button } from '@chatic/ui-kit/components/ui/button';

import { useSelectedChannelStore } from '../../../shared';

/**
 * Dev-only socket + cache debugging tool.
 *
 * Three lenses on the data path that feeds the UI:
 *  1. Live socket frames — a ring buffer of inbound WSS envelopes (domain/action/
 *     ref + raw JSON), so you can watch server data arrive in real time.
 *  2. IndexedDB explorer — browse what is actually persisted in `ChaticWebCacheDB`
 *     (filter by type/text, expand a row's stored model), read RAW (independent of
 *     the in-memory repositories) so it reflects real persistence.
 *  3. Chat gap detector — for the selected channel, list missing `chatNo` ranges to
 *     spot dropped / out-of-order messages, plus a restart-survival baseline check.
 */

const DB_NAME = 'ChaticWebCacheDB';
const STORE = 'cache_store';
const BASELINE_KEY = '__dou_debug_sync_baseline';
const FRAME_CAP = 100;
const ROW_CAP = 300;

// Raw IndexedDB row shape (mirrors libs/data IndexedDbRow, decoupled on purpose).
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

interface ScopeStat {
    cid: string;
    uid: string;
    total: number;
    byType: Record<string, number>;
}

interface Snapshot {
    totalRows: number;
    totalChats: number;
    scopes: ScopeStat[];
    capturedAt: number;
}

interface Baseline {
    totalRows: number;
    totalChats: number;
    channelId: string | null;
    channelChats: number;
    capturedAt: number;
}

interface GapReport {
    min: number | null;
    max: number | null;
    count: number;
    missing: number;
    ranges: string[];
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

const buildSnapshot = (rows: RawRow[]): Snapshot => {
    const scopeMap = new Map<string, ScopeStat>();
    let totalChats = 0;
    for (const r of rows) {
        const k = `${r.cid}::${r.uid}`;
        const scope = scopeMap.get(k) ?? { cid: r.cid, uid: r.uid, total: 0, byType: {} };
        scope.total += 1;
        scope.byType[r.type] = (scope.byType[r.type] ?? 0) + 1;
        scopeMap.set(k, scope);
        if (r.type === 'chat') totalChats += 1;
    }
    return {
        totalRows: rows.length,
        totalChats,
        scopes: [...scopeMap.values()].sort((a, b) => b.total - a.total),
        capturedAt: Date.now(),
    };
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

const Row = ({ label, value }: { label: string; value: string | number | boolean | null | undefined }) => (
    <div className="flex items-baseline justify-between gap-3 py-1">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className="break-all text-right font-mono text-xs text-foreground">{String(value ?? '—')}</span>
    </div>
);

const Section = ({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) => (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
        <div className="mb-1 flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-widest text-primary">{title}</p>
            {action}
        </div>
        <div className="divide-y divide-border">{children}</div>
    </div>
);

interface FrameEntry {
    seq: number;
    at: number;
    domain: string;
    action: string;
    ref: string;
    chatNo: number | null;
    raw: unknown;
}

/** Live ring buffer of inbound socket envelopes (newest first). */
const SocketFrameLog = () => {
    const [frames, setFrames] = useState<FrameEntry[]>([]);
    const [openSeq, setOpenSeq] = useState<number | null>(null);
    const pausedRef = useRef(false);
    const [paused, setPaused] = useState(false);
    const seqRef = useRef(0);

    useEffect(() => {
        return useWebSocketV2Store.subscribe(
            s => s.lastMessage,
            msg => {
                if (!msg || pausedRef.current) return;
                // WSSEnvelope: { type=domain, action, payload, meta:{ref} } — read loosely.

                const m = msg as any;
                const entry: FrameEntry = {
                    seq: ++seqRef.current,
                    at: Date.now(),
                    domain: m?.type ?? '?',
                    action: m?.action ?? '',
                    ref: m?.meta?.ref ?? '',
                    chatNo: m?.payload?.chatNo ?? m?.payload?.chat_no ?? null,
                    raw: m,
                };
                setFrames(prev => [entry, ...prev].slice(0, FRAME_CAP));
            }
        );
    }, []);

    const tally = useMemo(() => {
        const by: Record<string, number> = {};
        for (const f of frames) by[f.domain] = (by[f.domain] ?? 0) + 1;
        return by;
    }, [frames]);

    const togglePause = () => {
        pausedRef.current = !pausedRef.current;
        setPaused(pausedRef.current);
    };

    return (
        <Section
            title={`Live socket frames (${frames.length})`}
            action={
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={togglePause}>
                        {paused ? 'Resume' : 'Pause'}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setFrames([])}>
                        Clear
                    </Button>
                </div>
            }
        >
            <Row
                label="By domain"
                value={
                    Object.entries(tally)
                        .map(([d, n]) => `${d}:${n}`)
                        .join('  ') || '—'
                }
            />
            <div className="max-h-72 overflow-y-auto">
                {frames.length === 0 && <p className="py-2 text-xs text-muted-foreground">Waiting for frames…</p>}
                {frames.map(f => (
                    <div key={f.seq} className="border-b border-border/60 py-1">
                        <button
                            type="button"
                            onClick={() => setOpenSeq(openSeq === f.seq ? null : f.seq)}
                            className="flex w-full items-baseline gap-2 text-left font-mono text-[11px]"
                        >
                            <span className="text-muted-foreground">{fmtTime(f.at)}</span>
                            <span className="font-semibold text-primary">{f.domain}</span>
                            <span className="text-foreground">{f.action || '—'}</span>
                            {f.chatNo !== null && <span className="text-amber-600">#{f.chatNo}</span>}
                            {f.ref && <span className="ml-auto truncate text-muted-foreground">{f.ref}</span>}
                        </button>
                        {openSeq === f.seq && (
                            <pre className="mt-1 max-h-60 overflow-auto rounded bg-muted p-2 text-[10px] leading-snug text-foreground">
                                {JSON.stringify(f.raw, null, 2)}
                            </pre>
                        )}
                    </div>
                ))}
            </div>
        </Section>
    );
};

/** Browse persisted rows + detect chatNo gaps for the selected channel. */
const CacheExplorer = ({ channelId }: { channelId: string | null }) => {
    const [rows, setRows] = useState<RawRow[]>([]);
    const [typeFilter, setTypeFilter] = useState('all');
    const [text, setText] = useState('');
    const [openKey, setOpenKey] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setRows(await readAllRows());
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

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

    const gaps = useMemo(() => {
        if (!channelId) return null;
        const nos = rows
            .filter(r => r.type === 'chat' && r.channel_id === channelId && r.chat_no !== undefined)
            .map(r => r.chat_no as number);
        return computeGaps(nos);
    }, [rows, channelId]);

    return (
        <Section
            title={`IndexedDB explorer (${filtered.length}/${rows.length})`}
            action={
                <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
                    {loading ? 'Reading…' : 'Refresh'}
                </Button>
            }
        >
            <div className="flex flex-wrap items-center gap-2 py-2">
                <select
                    value={typeFilter}
                    onChange={e => setTypeFilter(e.target.value)}
                    className="rounded border border-border bg-background px-2 py-1 font-mono text-xs"
                >
                    {types.map(t => (
                        <option key={t} value={t}>
                            {t}
                        </option>
                    ))}
                </select>
                <input
                    value={text}
                    onChange={e => setText(e.target.value)}
                    placeholder="filter id / channel / key"
                    className="flex-1 rounded border border-border bg-background px-2 py-1 font-mono text-xs"
                />
            </div>

            {channelId && gaps && (
                <div
                    className={`my-1 rounded-lg px-3 py-2 text-xs ${
                        gaps.missing > 0
                            ? 'bg-red-500/15 text-red-600 dark:text-red-400'
                            : 'bg-green-500/15 text-green-600 dark:text-green-400'
                    }`}
                >
                    <span className="font-bold">
                        {gaps.missing > 0 ? `⚠ ${gaps.missing} missing chatNo` : '✓ no gaps'}
                    </span>{' '}
                    <span className="font-mono">
                        ch {channelId} — count {gaps.count}, range {gaps.min ?? '—'}…{gaps.max ?? '—'}
                    </span>
                    {gaps.ranges.length > 0 && (
                        <div className="mt-1 font-mono text-[10px]">gaps: {gaps.ranges.join(', ')}</div>
                    )}
                </div>
            )}

            <div className="max-h-72 overflow-y-auto">
                {filtered.map(r => (
                    <div key={r.key} className="border-b border-border/60 py-1">
                        <button
                            type="button"
                            onClick={() => setOpenKey(openKey === r.key ? null : r.key)}
                            className="flex w-full items-baseline gap-2 text-left font-mono text-[11px]"
                        >
                            <span className="font-semibold text-primary">{r.type}</span>
                            {r.chat_no !== undefined && <span className="text-amber-600">#{r.chat_no}</span>}
                            <span className="truncate text-foreground">{r.id}</span>
                            {r.channel_id && (
                                <span className="ml-auto truncate text-muted-foreground">{r.channel_id}</span>
                            )}
                        </button>
                        {openKey === r.key && (
                            <pre className="mt-1 max-h-60 overflow-auto rounded bg-muted p-2 text-[10px] leading-snug text-foreground">
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
    const profile = useWebCoreStore(s => s.profile);
    const { cloudId, selectedPlaceId, isConnected, isVerified, connectionStatus } = useWebSocketV2Store();
    const selectedChannelId = useSelectedChannelStore(s => s.selectedChannelId);

    const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
    const [baseline] = useState<Baseline | null>(() => readBaseline());

    const refresh = useCallback(async () => {
        setSnapshot(buildSnapshot(await readAllRows()));
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const captureBaseline = useCallback(async () => {
        const rows = await readAllRows();
        const channelChats = selectedChannelId
            ? rows.filter(r => r.type === 'chat' && r.channel_id === selectedChannelId).length
            : 0;
        const snap = buildSnapshot(rows);
        const b: Baseline = {
            totalRows: snap.totalRows,
            totalChats: snap.totalChats,
            channelId: selectedChannelId,
            channelChats,
            capturedAt: snap.capturedAt,
        };
        localStorage.setItem(BASELINE_KEY, JSON.stringify(b));
        navigate(0);
    }, [selectedChannelId, navigate]);

    const survival = useMemo(() => {
        if (!baseline || !snapshot) return null;
        return snapshot.totalRows >= baseline.totalRows && snapshot.totalChats >= baseline.totalChats;
    }, [baseline, snapshot]);

    return (
        <div className="mx-auto w-full max-w-4xl p-6">
            <div className="mb-4 flex items-baseline gap-3">
                <h1 className="text-base font-semibold text-foreground">Socket / Cache Debug</h1>
                <span className="font-mono text-[10px] text-muted-foreground">{DB_NAME}</span>
            </div>

            <div className="flex w-full flex-col gap-4">
                <Section title="Socket / Selection">
                    <Row label="Verified" value={isVerified} />
                    <Row label="Connected" value={isConnected} />
                    <Row label="Status" value={connectionStatus} />
                    <Row label="Socket cloudId" value={cloudId} />
                    <Row label="Socket placeId" value={selectedPlaceId} />
                    <Row label="Selected channelId" value={selectedChannelId} />
                    <Row label="UID" value={profile?.uid} />
                </Section>

                <SocketFrameLog />

                <CacheExplorer channelId={selectedChannelId} />

                <Section title="Persisted totals">
                    <Row label="Total rows (all scopes)" value={snapshot?.totalRows ?? '…'} />
                    <Row label="Total chats" value={snapshot?.totalChats ?? '…'} />
                    {snapshot?.scopes.map(s => (
                        <Row
                            key={`${s.cid}::${s.uid}`}
                            label={`scope ${s.cid}/${s.uid}`}
                            value={Object.entries(s.byType)
                                .map(([t, n]) => `${t}:${n}`)
                                .join(' ')}
                        />
                    ))}
                </Section>

                <Section title="Restart-survival check">
                    {baseline ? (
                        <>
                            <div
                                className={`mb-2 rounded-lg px-3 py-2 text-sm font-bold ${
                                    survival
                                        ? 'bg-green-500/15 text-green-600 dark:text-green-400'
                                        : 'bg-red-500/15 text-red-600 dark:text-red-400'
                                }`}
                            >
                                {survival ? '✅ PASS — cache survived restart' : '❌ FAIL — cache shrank'}
                            </div>
                            <Row
                                label="Rows (baseline → now)"
                                value={`${baseline.totalRows} → ${snapshot?.totalRows ?? '…'}`}
                            />
                            <Row
                                label="Chats (baseline → now)"
                                value={`${baseline.totalChats} → ${snapshot?.totalChats ?? '…'}`}
                            />
                            <Row label="Baseline captured" value={fmtTime(baseline.capturedAt)} />
                        </>
                    ) : (
                        <p className="py-2 text-xs text-muted-foreground">
                            Enter a channel, receive messages, then capture a baseline and reload to verify the cache
                            survives a restart.
                        </p>
                    )}
                    <div className="flex flex-wrap gap-2 pt-2">
                        <Button size="sm" onClick={() => void captureBaseline()}>
                            Capture baseline
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => navigate(0)}>
                            Reload app
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
            </div>
        </div>
    );
};
