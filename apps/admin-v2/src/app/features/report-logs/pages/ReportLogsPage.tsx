/**
 * `pages/report-logs/ReportLogsPage.tsx`
 * - Admin view of stored error/issue reports from `/mocks/0/list`.
 *
 * The kind (`type`) and the date range are server-side queries (deployed chatic-backend-api's
 * `MockListParam`, see reportLogApi.ts), so the total / page count / group+time samples all
 * recompute when either changes — and every one of those inputs resets the page to 0, since
 * page N of the old result set means nothing in the new one. Dates are KST day boundaries
 * server-side. Free-text and App filtering stay client-side over the fetched page.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useReportLogs } from '../hooks/use-report-logs';
import { STEREO_BY_KIND, type ReportKind, type ReportStage } from '../api/reportLogApi';
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

const PAGE_SIZE = 100;
/** How many recent records to pull for the aggregated view (sample-scoped counts). */
const GROUP_SAMPLE_SIZE = 1000;

export const ReportLogsPage = () => {
    const navigate = useNavigate();
    const [mode, setMode] = useState<ViewMode>('list');
    const [page, setPage] = useState(0);
    const [stage, setStage] = useState<ReportStage>('v1');
    const [autoRefresh, setAutoRefresh] = useState(false);
    // Server-side createdAt range (`YYYY-MM-DD` from the date inputs, KST day boundaries).
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [typeFilter, setTypeFilter] = useState<ReportKind>('all');
    // Server-side `LogEntry.level` filter — Slack reports never set `level`, so this
    // incidentally narrows to batch log entries regardless of the type filter above.
    const [levelFilter, setLevelFilter] = useState('');
    // Aggregated/time views work over a larger recent sample; list view paginates.
    const isSampleView = mode !== 'list';
    const { data, isLoading, isError, error, refetch, isFetching } = useReportLogs(
        {
            page: isSampleView ? 0 : page,
            limit: isSampleView ? GROUP_SAMPLE_SIZE : PAGE_SIZE,
            stage,
            // Narrowing the kind server-side is what makes `total` (and so the page count)
            // follow the filter. Records written before reports carried a stereo are all `log`,
            // so a legacy issue lands in the `error` bucket — the client-side pass below hides
            // those rows, leaving only the total slightly high.
            type: STEREO_BY_KIND[typeFilter],
            from: from || undefined,
            to: to || undefined,
            level: levelFilter || undefined,
        },
        autoRefresh ? AUTO_REFRESH_MS : false
    );

    const [query, setQuery] = useState('');
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

    // Client-side filters over the fetched page; kind and date range are already applied
    // server-side. The kind is re-checked here only to drop legacy rows the stereo filter
    // cannot separate (pre-stereo records are all `log`, so old issues ride along with errors).
    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return rows.filter(row => {
            if (typeFilter !== 'all' && row.type !== typeFilter) return false;
            if (appFilter !== 'all' && row.app !== appFilter) return false;
            if (q) {
                const haystack = [
                    row.title,
                    row.message,
                    row.userName,
                    row.userId,
                    row.app,
                    row.env,
                    row.type,
                    row.tag,
                    row.level,
                    row.source,
                ]
                    .filter(Boolean)
                    .join(' ')
                    .toLowerCase();
                if (!haystack.includes(q)) return false;
            }
            return true;
        });
    }, [rows, query, typeFilter, appFilter]);

    const groups = useMemo(() => groupReportLogs(filtered), [filtered]);
    const buckets = useMemo(() => bucketReportLogs(filtered), [filtered]);

    return (
        <div className="mx-auto flex min-h-full max-w-6xl flex-col gap-4 bg-background p-6 text-foreground">
            <header className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-lg font-semibold">Report Logs</h1>
                    <p className="text-sm text-muted-foreground">
                        {isSampleView
                            ? `제보 / 배치 로그 / 구 에러 리포트 ${mode === 'group' ? '메시지별 집계' : '시간대별 추이'} · 최근 ${GROUP_SAMPLE_SIZE.toLocaleString()}건 표본`
                            : '사용자 제보 + 배치 업로드 로그 + 폐지된 자동 에러 리포트(로그와 같은 stereo=log) 조회 · 타입·기간·레벨은 서버 조회(KST), 검색·App은 페이지 내 필터'}
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
                <label className="flex flex-col gap-1 text-xs text-muted-foreground" title="서버 조회 (stereo)">
                    타입
                    <select
                        value={typeFilter}
                        onChange={e => {
                            setPage(0);
                            setTypeFilter(e.target.value as ReportKind);
                        }}
                        className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                    >
                        <option value="all">전체</option>
                        <option value="error">error</option>
                        <option value="issue">issue</option>
                        <option value="log-entry">log</option>
                    </select>
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground" title="서버 조회 (LogEntry.level)">
                    레벨
                    <select
                        value={levelFilter}
                        onChange={e => {
                            setPage(0);
                            setLevelFilter(e.target.value);
                        }}
                        className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                    >
                        <option value="">전체</option>
                        <option value="error">error</option>
                        <option value="warn">warn</option>
                        <option value="info">info</option>
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
                <label className="flex flex-col gap-1 text-xs text-muted-foreground" title="KST 기준 서버 조회">
                    시작일
                    <input
                        type="date"
                        value={from}
                        max={to || undefined}
                        onChange={e => {
                            setPage(0);
                            setFrom(e.target.value);
                        }}
                        className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                    />
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground" title="KST 기준 서버 조회">
                    종료일
                    <input
                        type="date"
                        value={to}
                        min={from || undefined}
                        onChange={e => {
                            setPage(0);
                            setTo(e.target.value);
                        }}
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
