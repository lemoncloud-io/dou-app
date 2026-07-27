import { useState, useEffect } from 'react';
import { useRuntimeRepositories } from '@chatic/app-runtime';
import type { DataRepositoriesV2 } from '@chatic/data';

import { copyText } from '../../lib/copyText';

type CacheType = 'channel' | 'chat' | 'user' | 'join' | 'site' | 'invitecloud' | 'profile';

type DomainRow = { id: string; [key: string]: unknown };

const REPO_KEY: Record<CacheType, keyof DataRepositoriesV2> = {
    channel: 'channel',
    chat: 'chat',
    user: 'user',
    join: 'join',
    // The 'site' cache slot is served by the place repository (Site→Place 통합).
    site: 'place',
    invitecloud: 'cloud',
    profile: 'profile',
};

const FILTER_FIELDS: Record<CacheType, { key: string; label: string; required?: boolean }[]> = {
    channel: [{ key: 'sid', label: 'sid' }],
    chat: [
        { key: 'channelId', label: 'channelId', required: true },
        { key: 'cursorNo', label: 'cursorNo' },
        { key: 'limit', label: 'limit' },
    ],
    user: [{ key: 'channelId', label: 'channelId', required: true }],
    join: [{ key: 'channelId', label: 'channelId' }],
    site: [],
    invitecloud: [],
    profile: [{ key: 'sid', label: 'sid' }],
};

const ALL_TYPES: CacheType[] = ['channel', 'chat', 'user', 'join', 'site', 'invitecloud', 'profile'];

// Monotonic suffix so one-click templates never collide within a session.
let templateSeq = 0;
const makeId = (type: CacheType): string => `dbg-${type}-${Date.now().toString(36)}-${templateSeq++}`;

// Per-type starter rows for one-click create. cid/uid are stamped by cacheWrite from the
// live context, so templates only carry id + the fields a row needs to be useful/visible.
export const TEMPLATES: Record<CacheType, () => Record<string, unknown>> = {
    channel: () => ({ id: makeId('channel'), sid: '', name: 'Debug Channel' }),
    chat: () => ({ id: makeId('chat'), channelId: '', chatNo: 0, content: 'debug message' }),
    user: () => ({ id: makeId('user'), channelId: '', name: 'Debug User' }),
    join: () => ({ id: makeId('join'), channelId: '', userId: '', readNo: 0 }),
    site: () => ({ id: makeId('site'), name: 'Debug Place' }),
    invitecloud: () => ({ id: makeId('invitecloud'), name: 'Debug Cloud' }),
    profile: () => ({ id: makeId('profile'), sid: '', nick: 'Debug Nick' }),
};

function TypeCard({ type, repos, onClick }: { type: CacheType; repos: DataRepositoriesV2; onClick: () => void }) {
    const [count, setCount] = useState<number | null>(null);

    useEffect(() => {
        const repo = repos[REPO_KEY[type]] as unknown as {
            cacheReadList: (q: unknown) => Promise<{ list?: unknown[] }>;
        };
        repo.cacheReadList({} as any)
            .then(r => setCount(r?.list?.length ?? 0))
            .catch(() => setCount(0));
    }, [repos, type]);

    return (
        <button
            onClick={onClick}
            className="border border-border bg-card rounded-lg p-3 text-left hover:bg-muted transition-colors"
        >
            <p className="text-sm font-medium">{type}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{count === null ? '로딩 중...' : `${count}건`}</p>
        </button>
    );
}

function RowItem({ row, onDelete, onEdit }: { row: DomainRow; onDelete: () => void; onEdit: () => void }) {
    const [expanded, setExpanded] = useState(false);

    const summary = ['cid', 'uid', 'channelId', 'name']
        .filter(k => row[k] !== undefined)
        .map(k => `${k}: ${row[k]}`)
        .join(' · ');

    return (
        <div className="border border-border bg-card rounded-lg text-xs">
            <div
                className="flex items-center gap-2 px-3 py-2 cursor-pointer select-none"
                onClick={() => setExpanded(v => !v)}
            >
                <span className="shrink-0">{expanded ? '▼' : '▶'}</span>
                <span className="font-mono text-muted-foreground shrink-0">{row.id}</span>
                {summary && <span className="text-muted-foreground truncate">{summary}</span>}
                <button
                    onClick={e => {
                        e.stopPropagation();
                        copyText(JSON.stringify(row, null, 2));
                    }}
                    className="ml-auto shrink-0 text-muted-foreground hover:text-foreground"
                >
                    복사
                </button>
                <button
                    onClick={e => {
                        e.stopPropagation();
                        onEdit();
                    }}
                    className="shrink-0 text-primary hover:opacity-70"
                >
                    수정
                </button>
                <button
                    onClick={e => {
                        e.stopPropagation();
                        onDelete();
                    }}
                    className="shrink-0 text-destructive hover:opacity-70"
                >
                    삭제
                </button>
            </div>
            {expanded && (
                <pre className="px-3 pb-2 text-[10px] font-mono overflow-x-auto whitespace-pre-wrap break-all text-muted-foreground border-t border-border">
                    {JSON.stringify(row, null, 2)}
                </pre>
            )}
        </div>
    );
}

function DetailView({ type, repos, onBack }: { type: CacheType; repos: DataRepositoriesV2; onBack: () => void }) {
    const fields = FILTER_FIELDS[type];
    const [filters, setFilters] = useState<Record<string, string>>({});
    const [results, setResults] = useState<DomainRow[] | null>(null);
    const [loading, setLoading] = useState(false);
    const [areYouSure, setAreYouSure] = useState(false);

    const [writeJson, setWriteJson] = useState('');
    const [writeError, setWriteError] = useState<string | null>(null);
    const [showWritePanel, setShowWritePanel] = useState(false);

    const repo = repos[REPO_KEY[type]] as unknown as {
        observeList: (q: any, cb: (res: { list?: DomainRow[] } | null) => void) => () => void;
        cacheClear: () => Promise<void>;
        cacheDelete: (id: string) => Promise<void>;
        cacheWrite: (item: any) => Promise<void>;
    };

    const buildParams = () => {
        const params: Record<string, string | number> = {};
        for (const f of fields) {
            const v = filters[f.key];
            if (v) params[f.key] = f.key === 'cursorNo' || f.key === 'limit' ? Number(v) : v;
        }
        return params;
    };

    useEffect(() => {
        setLoading(true);
        let unsubscribe: (() => void) | undefined;
        const callback = (result: { list?: DomainRow[] } | null) => {
            setResults(result?.list ?? []);
            setLoading(false);
        };

        try {
            if (type === 'invitecloud') {
                const inviteRepo = repo as any;
                unsubscribe = inviteRepo.observeList(callback);
            } else {
                unsubscribe = repo.observeList(buildParams(), callback);
            }
        } catch (error) {
            console.error('Failed to observe list:', error);
            setLoading(false);
        }

        return () => {
            if (unsubscribe) {
                unsubscribe();
            }
        };
    }, [repo, type, JSON.stringify(filters)]);

    const handleClear = async () => {
        await repo.cacheClear();
        setAreYouSure(false);
    };

    const handleDelete = (id: string) => {
        void repo.cacheDelete(id);
    };

    const handleWrite = async () => {
        setWriteError(null);
        try {
            const parsed = JSON.parse(writeJson);
            await repo.cacheWrite(parsed);
            setWriteJson('');
            setShowWritePanel(false);
        } catch (e: any) {
            setWriteError(e.message || String(e));
        }
    };

    // One-click create: open the write panel pre-filled with this type's starter template.
    const openTemplate = () => {
        setWriteError(null);
        setWriteJson(JSON.stringify(TEMPLATES[type](), null, 2));
        setShowWritePanel(true);
    };

    // Edit: pre-fill the panel with an existing row's JSON. Same id → cacheWrite merges = update.
    const openEdit = (row: DomainRow) => {
        setWriteError(null);
        setWriteJson(JSON.stringify(row, null, 2));
        setShowWritePanel(true);
    };

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2">
                <button onClick={onBack} className="text-muted-foreground hover:text-foreground text-sm">
                    ← 목록
                </button>
                <span className="font-semibold text-sm">{type}</span>
            </div>

            {fields.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {fields.map(f => (
                        <div key={f.key} className="flex flex-col gap-0.5">
                            <label className="text-[10px] text-muted-foreground">
                                {f.label}
                                {f.required ? ' *' : ''}
                            </label>
                            <input
                                value={filters[f.key] ?? ''}
                                onChange={e => setFilters(prev => ({ ...prev, [f.key]: e.target.value }))}
                                className="border border-border bg-background rounded px-2 py-1 text-xs w-36 focus:outline-none focus:ring-1 focus:ring-primary"
                                placeholder={f.label}
                            />
                        </div>
                    ))}
                </div>
            )}

            <div className="flex gap-2 flex-wrap">
                <button
                    onClick={openTemplate}
                    className="px-3 py-1 text-xs rounded bg-primary text-primary-foreground hover:opacity-80"
                >
                    + 새 행(템플릿)
                </button>
                <button
                    onClick={() => setShowWritePanel(v => !v)}
                    className="px-3 py-1 text-xs rounded border border-border text-muted-foreground hover:text-foreground"
                >
                    {showWritePanel ? '작성 취소' : '데이터 추가/수정'}
                </button>
                {!areYouSure ? (
                    <button
                        onClick={() => setAreYouSure(true)}
                        className="px-3 py-1 text-xs rounded border border-destructive text-destructive hover:opacity-70"
                    >
                        전체삭제
                    </button>
                ) : (
                    <>
                        <button
                            onClick={() => void handleClear()}
                            className="px-3 py-1 text-xs rounded bg-destructive text-destructive-foreground"
                        >
                            확인
                        </button>
                        <button
                            onClick={() => setAreYouSure(false)}
                            className="px-3 py-1 text-xs rounded border border-border text-muted-foreground hover:text-foreground"
                        >
                            취소
                        </button>
                    </>
                )}
            </div>

            {showWritePanel && (
                <div className="border border-border bg-card rounded-lg p-3 space-y-2">
                    <p className="text-xs font-semibold">데이터 추가/수정 (JSON)</p>
                    <textarea
                        value={writeJson}
                        onChange={e => setWriteJson(e.target.value)}
                        placeholder='{ "id": "...", ... }'
                        className="w-full h-32 border border-border bg-background rounded p-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    {writeError && <p className="text-xs text-destructive">{writeError}</p>}
                    <button
                        onClick={() => void handleWrite()}
                        className="px-3 py-1 text-xs rounded bg-primary text-primary-foreground"
                    >
                        저장
                    </button>
                </div>
            )}

            {results !== null && (
                <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                        <p className="text-xs text-muted-foreground">{results.length}건</p>
                        {results.length > 0 && (
                            <button
                                onClick={() => copyText(JSON.stringify(results, null, 2))}
                                className="text-xs text-muted-foreground hover:text-foreground"
                            >
                                전체 복사
                            </button>
                        )}
                    </div>
                    {results.length === 0 ? (
                        <p className="text-xs text-muted-foreground">결과 없음</p>
                    ) : (
                        results.map(row => (
                            <RowItem
                                key={row.id}
                                row={row}
                                onDelete={() => handleDelete(row.id)}
                                onEdit={() => openEdit(row)}
                            />
                        ))
                    )}
                </div>
            )}

            {loading && <p className="text-xs text-muted-foreground font-medium">조회 중...</p>}
        </div>
    );
}

export const DBBrowser = () => {
    const repos = useRuntimeRepositories() as unknown as DataRepositoriesV2;
    const [selected, setSelected] = useState<CacheType | null>(null);

    if (selected) {
        return <DetailView type={selected} repos={repos} onBack={() => setSelected(null)} />;
    }

    return (
        <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cache Tables</p>
            <div className="grid grid-cols-2 gap-2">
                {ALL_TYPES.map(type => (
                    <TypeCard key={type} type={type} repos={repos} onClick={() => setSelected(type)} />
                ))}
            </div>
        </div>
    );
};
