import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useWebCoreStore } from '@chatic/web-core';
import { useWebSocketV2Store } from '@chatic/socket';
import { Button } from '@chatic/ui-kit/components/ui/button';

import { useSelectedChannelStore } from '../../../shared';

/**
 * Dev-only data-sync verification tool.
 *
 * Reads the engine's IndexedDB cache (`ChaticWebCacheDB`) DIRECTLY — independent
 * of the in-memory repository state — so it reports what is *actually persisted*.
 * Scenario it proves: enter a channel → receive messages (live frame counter) →
 * capture a baseline → reload the app → the page auto-compares to confirm the
 * cache survived the restart.
 */

const DB_NAME = 'ChaticWebCacheDB';
const STORE = 'cache_store';
const BASELINE_KEY = '__dou_debug_sync_baseline';

// Raw IndexedDB row shape (mirrors libs/data IndexedDbRow, decoupled on purpose).
interface RawRow {
    key: string;
    type: string;
    cid: string;
    uid: string;
    id: string;
    channel_id?: string;
    chat_no?: number;
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
    channelId: string | null;
    channelChats: number;
    channelMaxChatNo: number | null;
    capturedAt: number;
}

interface Baseline {
    totalRows: number;
    totalChats: number;
    channelId: string | null;
    channelChats: number;
    channelMaxChatNo: number | null;
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

const buildSnapshot = (rows: RawRow[], channelId: string | null): Snapshot => {
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

    const channelChatRows = channelId ? rows.filter(r => r.type === 'chat' && r.channel_id === channelId) : [];
    const channelMaxChatNo = channelChatRows.reduce<number | null>(
        (max, r) => (r.chat_no === undefined ? max : Math.max(max ?? -1, r.chat_no)),
        null
    );

    return {
        totalRows: rows.length,
        totalChats,
        scopes: [...scopeMap.values()].sort((a, b) => b.total - a.total),
        channelId,
        channelChats: channelChatRows.length,
        channelMaxChatNo,
        capturedAt: Date.now(),
    };
};

const readBaseline = (): Baseline | null => {
    try {
        const raw = localStorage.getItem(BASELINE_KEY);
        return raw ? (JSON.parse(raw) as Baseline) : null;
    } catch {
        return null;
    }
};

const Row = ({ label, value }: { label: string; value: string | number | boolean | null | undefined }) => (
    <div className="flex items-baseline justify-between gap-3 py-1">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className="break-all text-right font-mono text-xs text-foreground">{String(value ?? '—')}</span>
    </div>
);

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
        <p className="mb-1 text-[11px] font-bold uppercase tracking-widest text-primary">{title}</p>
        <div className="divide-y divide-border">{children}</div>
    </div>
);

const fmtTime = (ts: number) => new Date(ts).toLocaleTimeString();

export const DebugSyncPage = () => {
    const navigate = useNavigate();
    const profile = useWebCoreStore(s => s.profile);
    const { cloudId, selectedPlaceId, isConnected, isVerified, connectionStatus } = useWebSocketV2Store();
    const selectedChannelId = useSelectedChannelStore(s => s.selectedChannelId);

    const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
    const [baseline] = useState<Baseline | null>(() => readBaseline());
    const [loading, setLoading] = useState(false);

    // Live inbound socket-frame counters (proves "message received").
    const [frames, setFrames] = useState({ total: 0, chat: 0, lastType: '', lastChatNo: null as number | null, at: 0 });
    const framesRef = useRef(frames);
    framesRef.current = frames;

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const rows = await readAllRows();
            setSnapshot(buildSnapshot(rows, selectedChannelId));
        } finally {
            setLoading(false);
        }
    }, [selectedChannelId]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    useEffect(() => {
        const unsub = useWebSocketV2Store.subscribe(
            s => s.lastMessage,
            msg => {
                if (!msg) return;
                // WSSEnvelope shape varies by domain; read defensively.
                 
                const m = msg as any;
                const type: string = m?.type ?? '';
                const isChat = type.startsWith('chat');
                const prev = framesRef.current;
                setFrames({
                    total: prev.total + 1,
                    chat: prev.chat + (isChat ? 1 : 0),
                    lastType: type,
                    lastChatNo: m?.data?.chatNo ?? m?.data?.chat_no ?? prev.lastChatNo,
                    at: Date.now(),
                });
            }
        );
        return unsub;
    }, []);

    const captureBaseline = useCallback(() => {
        if (!snapshot) return;
        const b: Baseline = {
            totalRows: snapshot.totalRows,
            totalChats: snapshot.totalChats,
            channelId: snapshot.channelId,
            channelChats: snapshot.channelChats,
            channelMaxChatNo: snapshot.channelMaxChatNo,
            capturedAt: snapshot.capturedAt,
        };
        localStorage.setItem(BASELINE_KEY, JSON.stringify(b));
         
        console.info('[sync-debug] baseline captured', b);
        navigate(0);
    }, [snapshot, navigate]);

    const clearBaseline = useCallback(() => {
        localStorage.removeItem(BASELINE_KEY);
        navigate(0);
    }, [navigate]);

    const verdict = useMemo(() => {
        if (!baseline || !snapshot) return null;
        const rowsOk = snapshot.totalRows >= baseline.totalRows;
        const chatsOk = snapshot.totalChats >= baseline.totalChats;
        const chanOk = snapshot.channelChats >= baseline.channelChats;
        return { pass: rowsOk && chatsOk && chanOk, rowsOk, chatsOk, chanOk };
    }, [baseline, snapshot]);

    return (
        <div className="flex h-screen flex-col bg-background">
            <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-6">
                <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
                    ← Home
                </Button>
                <h1 className="text-base font-semibold text-foreground">Sync Verify</h1>
                <span className="ml-auto font-mono text-[10px] text-muted-foreground">{DB_NAME}</span>
            </header>

            <div className="scrollbar-thin mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 overflow-y-auto p-8">
                <Section title="Socket / Selection">
                    <Row label="Verified" value={isVerified} />
                    <Row label="Connected" value={isConnected} />
                    <Row label="Status" value={connectionStatus} />
                    <Row label="Socket cloudId" value={cloudId} />
                    <Row label="Socket placeId" value={selectedPlaceId} />
                    <Row label="Selected channelId" value={selectedChannelId} />
                    <Row label="UID" value={profile?.uid} />
                </Section>

                <Section title="Live inbound frames (this session)">
                    <Row label="Total frames" value={frames.total} />
                    <Row label="Chat frames" value={frames.chat} />
                    <Row label="Last type" value={frames.lastType || '—'} />
                    <Row label="Last chatNo" value={frames.lastChatNo} />
                    <Row label="Last at" value={frames.at ? fmtTime(frames.at) : '—'} />
                </Section>

                <Section title="Persisted cache (raw IndexedDB)">
                    <Row label="Total rows (all scopes)" value={snapshot?.totalRows ?? '…'} />
                    <Row label="Total chats" value={snapshot?.totalChats ?? '…'} />
                    <Row label="Selected channel chats" value={snapshot?.channelChats ?? '…'} />
                    <Row label="Selected channel maxChatNo" value={snapshot?.channelMaxChatNo} />
                    {snapshot?.scopes.map(s => (
                        <Row
                            key={`${s.cid}::${s.uid}`}
                            label={`scope ${s.cid}/${s.uid}`}
                            value={`${s.total} (${Object.entries(s.byType)
                                .map(([t, n]) => `${t}:${n}`)
                                .join(' ')})`}
                        />
                    ))}
                    <div className="flex gap-2 pt-2">
                        <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
                            {loading ? 'Reading…' : 'Refresh'}
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                                 
                                console.log('[sync-debug] rows', await readAllRows());
                            }}
                        >
                            Dump to console
                        </Button>
                    </div>
                </Section>

                <Section title="Restart-survival check">
                    {!baseline && (
                        <p className="py-2 text-xs text-muted-foreground">
                            No baseline. Enter a channel, receive messages, then capture a baseline and reload to verify
                            the cache survives a restart.
                        </p>
                    )}
                    {baseline && (
                        <>
                            <div
                                className={`mb-2 rounded-lg px-3 py-2 text-sm font-bold ${
                                    verdict?.pass
                                        ? 'bg-green-500/15 text-green-600 dark:text-green-400'
                                        : 'bg-red-500/15 text-red-600 dark:text-red-400'
                                }`}
                            >
                                {verdict?.pass ? '✅ PASS — cache survived restart' : '❌ FAIL — cache shrank'}
                            </div>
                            <Row
                                label="Rows (baseline → now)"
                                value={`${baseline.totalRows} → ${snapshot?.totalRows ?? '…'} ${verdict ? (verdict.rowsOk ? '✓' : '✗') : ''}`}
                            />
                            <Row
                                label="Chats (baseline → now)"
                                value={`${baseline.totalChats} → ${snapshot?.totalChats ?? '…'} ${verdict ? (verdict.chatsOk ? '✓' : '✗') : ''}`}
                            />
                            <Row
                                label="Channel chats (baseline → now)"
                                value={`${baseline.channelChats} → ${snapshot?.channelChats ?? '…'} ${verdict ? (verdict.chanOk ? '✓' : '✗') : ''}`}
                            />
                            <Row label="Baseline channelId" value={baseline.channelId} />
                            <Row label="Baseline captured" value={fmtTime(baseline.capturedAt)} />
                        </>
                    )}
                    <div className="flex flex-wrap gap-2 pt-2">
                        <Button size="sm" onClick={captureBaseline} disabled={!snapshot}>
                            Capture baseline
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => navigate(0)}>
                            Reload app
                        </Button>
                        {baseline && (
                            <Button variant="ghost" size="sm" onClick={clearBaseline}>
                                Clear baseline
                            </Button>
                        )}
                    </div>
                </Section>
            </div>
        </div>
    );
};
