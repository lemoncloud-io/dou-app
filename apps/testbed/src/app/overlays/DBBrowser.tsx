import { useState, useEffect } from 'react';
import { useRuntimeRepositories } from '@chatic/app-runtime';
import type { DataRepositoriesV2 } from '@chatic/data';

type CacheType = 'channel' | 'chat' | 'user' | 'join' | 'site' | 'invitecloud' | 'profile';

type DomainRow = { id: string; [key: string]: unknown };

const REPO_KEY: Record<CacheType, keyof DataRepositoriesV2> = {
    channel: 'channel',
    chat: 'chat',
    user: 'user',
    join: 'join',
    site: 'site',
    invitecloud: 'inviteCloud',
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

function RowItem({ row, onDelete }: { row: DomainRow; onDelete: () => void }) {
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
                        onDelete();
                    }}
                    className="ml-auto shrink-0 text-destructive hover:opacity-70"
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

    const repo = repos[REPO_KEY[type]] as unknown as {
        cacheReadList: (q: unknown) => Promise<{ list?: DomainRow[] }>;
        cacheClear: () => Promise<void>;
        cacheDelete: (id: string) => Promise<void>;
    };

    const buildParams = () => {
        const params: Record<string, string | number> = {};
        for (const f of fields) {
            const v = filters[f.key];
            if (v) params[f.key] = f.key === 'cursorNo' || f.key === 'limit' ? Number(v) : v;
        }
        return params;
    };

    const runQuery = async () => {
        setLoading(true);
        try {
            const result = await repo.cacheReadList(buildParams() as any);
            setResults(result?.list ?? []);
        } finally {
            setLoading(false);
        }
    };

    const handleClear = async () => {
        await repo.cacheClear();
        setAreYouSure(false);
        setResults(null);
        // refresh count by re-querying
        const result = await repo.cacheReadList({} as any);
        setResults(result?.list ?? []);
    };

    const handleDelete = (id: string) => {
        void repo.cacheDelete(id).then(() => {
            setResults(prev => prev?.filter(r => r.id !== id) ?? null);
        });
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
                    onClick={() => void runQuery()}
                    disabled={loading}
                    className="px-3 py-1 text-xs rounded bg-primary text-primary-foreground disabled:opacity-50"
                >
                    조회
                </button>
                <button
                    onClick={() => void runQuery()}
                    disabled={loading}
                    className="px-3 py-1 text-xs rounded border border-border text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                    새로고침
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

            {results !== null && (
                <div className="space-y-1.5">
                    <p className="text-xs text-muted-foreground">{results.length}건</p>
                    {results.length === 0 ? (
                        <p className="text-xs text-muted-foreground">결과 없음</p>
                    ) : (
                        results.map(row => <RowItem key={row.id} row={row} onDelete={() => handleDelete(row.id)} />)
                    )}
                </div>
            )}

            {loading && <p className="text-xs text-muted-foreground">조회 중...</p>}
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
