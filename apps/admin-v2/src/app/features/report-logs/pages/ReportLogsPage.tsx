/**
 * `pages/report-logs/ReportLogsPage.tsx`
 * - Admin view of stored error/issue reports from `/mocks/0/list`.
 *
 * Text/date filtering is client-side over the fetched page — server-side query
 * params are unverified (see the report-logs spec). The UI states this limit.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useReportLogs } from '../hooks/use-report-logs';
import type { ReportStage } from '../api/reportLogApi';
import { parseReportLog, type ReportLogRow } from '../lib/parseReportLog';
import { groupReportLogs } from '../lib/groupReportLogs';
import { bucketReportLogs } from '../lib/bucketReportLogs';
import { downloadTextFile, rowsToCsv } from '../lib/reportLogFormat';
import { ReportDetailDrawer } from '../components/ReportDetailDrawer';
import { ReportLogTable } from '../components/ReportLogTable';
import { ReportLogGroupTable } from '../components/ReportLogGroupTable';
import { ReportLogTimeChart } from '../components/ReportLogTimeChart';

type ViewMode = 'list' | 'group' | 'time';

/** Auto-refresh cadence when the toggle is on. */
const AUTO_REFRESH_MS = 15_000;

/** Epoch ms for the start of a yyyy-mm-dd date input, or undefined. */
const startOfDay = (value: string): number | undefined => {
    if (!value) return undefined;
    const ms = new Date(`${value}T00:00:00`).getTime();
    return Number.isNaN(ms) ? undefined : ms;
};
const endOfDay = (value: string): number | undefined => {
    if (!value) return undefined;
    const ms = new Date(`${value}T23:59:59.999`).getTime();
    return Number.isNaN(ms) ? undefined : ms;
};

const PAGE_SIZE = 100;
/** How many recent records to pull for the aggregated view (sample-scoped counts). */
const GROUP_SAMPLE_SIZE = 1000;

export const ReportLogsPage = () => {
    const navigate = useNavigate();
    const [mode, setMode] = useState<ViewMode>('list');
    const [page, setPage] = useState(0);
    const [stage, setStage] = useState<ReportStage>('v1');
    const [autoRefresh, setAutoRefresh] = useState(false);
    // Aggregated/time views work over a larger recent sample; list view paginates.
    const isSampleView = mode !== 'list';
    const { data, isLoading, isError, error, refetch, isFetching } = useReportLogs(
        {
            page: isSampleView ? 0 : page,
            limit: isSampleView ? GROUP_SAMPLE_SIZE : PAGE_SIZE,
            stage,
        },
        autoRefresh ? AUTO_REFRESH_MS : false
    );

    const [query, setQuery] = useState('');
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [typeFilter, setTypeFilter] = useState<'all' | 'error' | 'issue'>('all');
    const [appFilter, setAppFilter] = useState('all');
    const [selected, setSelected] = useState<ReportLogRow | null>(null);

    const total = data?.total ?? 0;
    const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const goPage = (next: number) => {
        setSelected(null);
        setPage(Math.min(Math.max(0, next), pageCount - 1));
    };

    const rows = useMemo(() => {
        const parsed = (data?.list ?? []).map(parseReportLog);
        // Newest first.
        return parsed.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    }, [data]);

    // Distinct app values present on the current page, for the app filter dropdown.
    const appOptions = useMemo(
        () => Array.from(new Set(rows.map(r => r.app).filter((a): a is string => !!a))).sort(),
        [rows]
    );

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        const fromMs = startOfDay(from);
        const toMs = endOfDay(to);
        return rows.filter(row => {
            if (typeFilter !== 'all' && row.type !== typeFilter) return false;
            if (appFilter !== 'all' && row.app !== appFilter) return false;
            if (fromMs !== undefined && (row.createdAt ?? 0) < fromMs) return false;
            if (toMs !== undefined && (row.createdAt ?? 0) > toMs) return false;
            if (q) {
                const haystack = [row.title, row.message, row.userName, row.userId, row.app, row.env, row.type]
                    .filter(Boolean)
                    .join(' ')
                    .toLowerCase();
                if (!haystack.includes(q)) return false;
            }
            return true;
        });
    }, [rows, query, from, to, typeFilter, appFilter]);

    const groups = useMemo(() => groupReportLogs(filtered), [filtered]);
    const buckets = useMemo(() => bucketReportLogs(filtered), [filtered]);

    return (
        <div className="mx-auto flex min-h-full max-w-6xl flex-col gap-4 bg-background p-6 text-foreground">
            <header className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-lg font-semibold">Report Logs</h1>
                    <p className="text-sm text-muted-foreground">
                        {isSampleView
                            ? `reportError / reportIssue ${mode === 'group' ? '메시지별 집계' : '시간대별 추이'} · 최근 ${GROUP_SAMPLE_SIZE.toLocaleString()}건 표본`
                            : 'reportError / reportIssue 리포트 조회 · 검색·기간은 불러온 페이지 내 필터'}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {/* List / aggregated / time view toggle. */}
                    <div className="flex rounded-md border border-border p-0.5 text-sm">
                        {(['list', 'group', 'time'] as const).map(m => (
                            <button
                                key={m}
                                type="button"
                                onClick={() => setMode(m)}
                                className={`rounded px-3 py-1 ${mode === m ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
                            >
                                {m === 'list' ? '목록' : m === 'group' ? '집계' : '추이'}
                            </button>
                        ))}
                    </div>
                    {/* Stage toggle: prod(v1) vs dev(d1) DOU backend. */}
                    <select
                        value={stage}
                        onChange={e => {
                            setPage(0);
                            setStage(e.target.value as ReportStage);
                        }}
                        className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                        title="DOU 스테이지"
                    >
                        <option value="v1">prod (v1)</option>
                        <option value="d1">dev (d1)</option>
                    </select>
                    <button
                        type="button"
                        onClick={() => setAutoRefresh(v => !v)}
                        className={`rounded-md border border-border px-3 py-1.5 text-sm ${autoRefresh ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
                        title={`자동 새로고침 ${AUTO_REFRESH_MS / 1000}초`}
                    >
                        자동 {autoRefresh ? 'ON' : 'OFF'}
                    </button>
                    <button
                        type="button"
                        onClick={() => downloadTextFile(`report-logs-${stage}-p${page}.csv`, rowsToCsv(filtered))}
                        disabled={filtered.length === 0}
                        className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
                    >
                        CSV
                    </button>
                    <button
                        type="button"
                        onClick={() => refetch()}
                        disabled={isFetching}
                        className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
                    >
                        {isFetching ? '불러오는 중…' : '새로고침'}
                    </button>
                </div>
            </header>

            <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-3">
                <label className="flex flex-1 flex-col gap-1 text-xs text-muted-foreground">
                    검색
                    <input
                        type="text"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder="제목·메시지·앱·환경…"
                        className="min-w-[12rem] rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                    />
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                    타입
                    <select
                        value={typeFilter}
                        onChange={e => setTypeFilter(e.target.value as 'all' | 'error' | 'issue')}
                        className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                    >
                        <option value="all">전체</option>
                        <option value="error">error</option>
                        <option value="issue">issue</option>
                    </select>
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                    App
                    <select
                        value={appFilter}
                        onChange={e => setAppFilter(e.target.value)}
                        className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                    >
                        <option value="all">전체</option>
                        {appOptions.map(a => (
                            <option key={a} value={a}>
                                {a}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                    시작일
                    <input
                        type="date"
                        value={from}
                        onChange={e => setFrom(e.target.value)}
                        className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                    />
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                    종료일
                    <input
                        type="date"
                        value={to}
                        onChange={e => setTo(e.target.value)}
                        className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                    />
                </label>
                <span className="ml-auto text-xs text-muted-foreground">
                    {mode === 'group'
                        ? `${groups.length}종 · ${filtered.length}건 표본 · 전체 ${total.toLocaleString()}건`
                        : mode === 'time'
                          ? `${filtered.length}건 표본 · 전체 ${total.toLocaleString()}건`
                          : `현재 페이지 ${filtered.length}/${rows.length}건 · 전체 ${total.toLocaleString()}건`}
                </span>
            </div>

            <div className="rounded-lg border border-border bg-card">
                {isLoading ? (
                    <p className="px-4 py-10 text-center text-sm text-muted-foreground">불러오는 중…</p>
                ) : isError ? (
                    <p className="px-4 py-10 text-center text-sm text-destructive">
                        조회 실패: {(error as Error)?.message ?? '알 수 없는 오류'}
                    </p>
                ) : mode === 'group' ? (
                    <ReportLogGroupTable groups={groups} onSelect={g => setSelected(g.sample)} />
                ) : mode === 'time' ? (
                    <ReportLogTimeChart buckets={buckets} />
                ) : (
                    <ReportLogTable rows={filtered} onSelect={setSelected} selectedId={selected?.id} />
                )}
            </div>

            <div className={`flex items-center justify-center gap-2 text-sm ${isSampleView ? 'hidden' : ''}`}>
                <button
                    type="button"
                    onClick={() => goPage(0)}
                    disabled={page <= 0 || isFetching}
                    className="rounded-md border border-border px-2 py-1 hover:bg-muted disabled:opacity-40"
                >
                    « 처음
                </button>
                <button
                    type="button"
                    onClick={() => goPage(page - 1)}
                    disabled={page <= 0 || isFetching}
                    className="rounded-md border border-border px-2 py-1 hover:bg-muted disabled:opacity-40"
                >
                    ‹ 이전
                </button>
                <span className="px-2 text-muted-foreground">
                    {page + 1} / {pageCount}
                </span>
                <button
                    type="button"
                    onClick={() => goPage(page + 1)}
                    disabled={page >= pageCount - 1 || isFetching}
                    className="rounded-md border border-border px-2 py-1 hover:bg-muted disabled:opacity-40"
                >
                    다음 ›
                </button>
                <button
                    type="button"
                    onClick={() => goPage(pageCount - 1)}
                    disabled={page >= pageCount - 1 || isFetching}
                    className="rounded-md border border-border px-2 py-1 hover:bg-muted disabled:opacity-40"
                >
                    마지막 »
                </button>
            </div>

            <ReportDetailDrawer
                row={selected}
                onClose={() => setSelected(null)}
                onObserve={uid => navigate(`/socket-lab?observe=${encodeURIComponent(uid)}`)}
            />
        </div>
    );
};
