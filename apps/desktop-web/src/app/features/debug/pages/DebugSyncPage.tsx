import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

import { useSocketState } from '@chatic/app-runtime';
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
    chat: '메시지',
    channel: '채널',
    join: '멤버',
    user: '사용자',
    site: '플레이스',
    profile: '프로필',
    invitecloud: '초대',
};

const FRAME_LABEL: Record<string, string> = {
    'chat.send': '💬 새 메시지',
    'chat.feed': '📥 메시지 동기화',
    'chat.update': '✏️ 메시지 수정',
    'chat.delete': '🗑️ 메시지 삭제',
    'channel.create': '➕ 채널 생성',
    'channel.update': '📂 채널 변경',
    'channel.sync': '🔄 채널 동기화',
    'join.update': '👁️ 읽음·멤버 변경',
    'user.read': '👁️ 읽음 처리',
    'user.update': '🙍 사용자 변경',
    'auth.update': '🔑 인증 갱신',
    'sync.update': '🔄 동기화',
    'system.ping': '📡 연결 확인',
    'system.info': 'ℹ️ 서버 정보',
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
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-sm font-semibold text-foreground">{value}</p>
        {sub && <p className="truncate text-[11px] text-muted-foreground">{sub}</p>}
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
        <p className="mb-3 text-sm font-semibold text-foreground">한눈에 보기</p>
        <div className="grid grid-cols-2 gap-3">
            <Stat label="소켓 연결" value={`${socket.dot} ${socket.text}`} />
            <Stat label="이번 세션 수신" value={`${frameCount} 프레임`} />
            <Stat label="저장된 캐시" value={`${totalRows}개`} sub={typeText} />
            <Stat label="메시지 누락" value={gapText} />
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
            title={`실시간 소켓 수신 (${frames.length})`}
            hint="서버에서 방금 도착한 데이터입니다. 줄을 누르면 원본 JSON이 보입니다."
            action={
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setPaused(!paused)}>
                        {paused ? '재개' : '일시정지'}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={clear}>
                        지우기
                    </Button>
                </div>
            }
        >
            <div className="max-h-72 divide-y divide-border/60 overflow-y-auto">
                {frames.length === 0 && (
                    <p className="py-3 text-sm text-muted-foreground">아직 수신된 데이터가 없습니다…</p>
                )}
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
            title={`저장된 캐시 (${filtered.length}/${rows.length})`}
            hint="기기에 실제로 저장된 레코드입니다 (IndexedDB). 줄을 누르면 내용이 보입니다."
            action={
                <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
                    {loading ? '읽는 중…' : '새로고침'}
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
                            {t === 'all' ? '전체' : `${TYPE_LABEL[t] ?? t} (${t})`}
                        </option>
                    ))}
                </select>
                <input
                    value={text}
                    onChange={e => setText(e.target.value)}
                    placeholder="id / 채널 / key 검색"
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
                        {gap.missing > 0 ? `⚠️ 메시지 ${gap.missing}개 빠짐` : '✅ 누락 없음'}
                    </span>{' '}
                    <span className="text-muted-foreground">
                        (열린 채널, {gap.count}개 저장 · 범위 {gap.min ?? '—'}…{gap.max ?? '—'})
                    </span>
                    {gap.ranges.length > 0 && (
                        <div className="mt-1 font-mono text-[10px]">빠진 번호: {gap.ranges.join(', ')}</div>
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
    const { isConnected, isVerified } = useSocketState();
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
            ? { dot: '🟢', text: '연결됨 · 인증 완료' }
            : { dot: '🟡', text: '연결됨 · 인증 대기' }
        : { dot: '🔴', text: '끊김' };
    const typeText = Object.entries(typeTotals)
        .sort((a, b) => b[1] - a[1])
        .map(([t, n]) => `${TYPE_LABEL[t] ?? t} ${n}`)
        .join(' · ');
    const gapText = !selectedChannelId
        ? '채널을 열면 검사'
        : gap && gap.missing > 0
          ? `⚠️ ${gap.missing}개 빠짐`
          : '✅ 누락 없음';

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
                    <h1 className="text-base font-semibold text-foreground">소켓 / 캐시</h1>
                    <p className="text-xs text-muted-foreground">
                        실시간 소켓 수신과 로컬 캐시(IndexedDB) 상태를 확인합니다.
                    </p>
                </div>
                <VersionInfo className="text-right" />
            </div>

            <div className="flex w-full flex-col gap-4">
                <HealthCard
                    socket={socket}
                    totalRows={rows.length}
                    typeText={typeText || '비어 있음'}
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
                    title="재시작 후에도 남아있나?"
                    hint="현재 캐시를 기준으로 저장한 뒤 새로고침하면, 데이터가 살아남았는지 자동으로 비교합니다."
                >
                    {baseline ? (
                        <div
                            className={`mb-2 rounded-lg px-3 py-2 text-sm font-semibold ${
                                survival
                                    ? 'bg-green-500/15 text-green-600 dark:text-green-400'
                                    : 'bg-red-500/15 text-red-600 dark:text-red-400'
                            }`}
                        >
                            {survival ? '✅ 통과 — 재시작 후에도 캐시 유지됨' : '❌ 실패 — 캐시가 줄었음'}
                            <span className="ml-2 font-normal text-muted-foreground">
                                (저장 {baseline.totalRows}개 → 지금 {rows.length}개, 기준 {fmtTime(baseline.capturedAt)}
                                )
                            </span>
                        </div>
                    ) : (
                        <p className="mb-2 text-xs text-muted-foreground">
                            채널에 들어가 메시지를 받은 뒤 “기준 저장 → 새로고침”으로 캐시 유지 여부를 확인하세요.
                        </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                        <Button size="sm" onClick={captureBaseline}>
                            기준 저장
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => navigate(0)}>
                            새로고침
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
                                기준 삭제
                            </Button>
                        )}
                    </div>
                </Section>

                <Section
                    title="debug 데이터 정리"
                    hint="“캐시 쓰기 실험” 탭에서 만든 가짜 레코드(채널/메시지)를 한 번에 지웁니다. 실제 채팅에 섞인 [sample] 메시지를 없앨 때 사용하세요."
                >
                    <div className="flex items-center justify-between gap-3">
                        <span className="text-sm text-muted-foreground">
                            {debugRows.length > 0
                                ? `debug 레코드 ${debugRows.length}개 발견`
                                : '깨끗함 (debug 레코드 없음)'}
                        </span>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void purgeDebugData()}
                            disabled={debugRows.length === 0}
                        >
                            정리
                        </Button>
                    </div>
                </Section>
            </div>
        </div>
    );
};
