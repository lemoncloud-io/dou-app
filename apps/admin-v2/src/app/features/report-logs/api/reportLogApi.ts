/**
 * `api/report-logs/reportLogApi.ts`
 * - Reads stored reports and log entries from the DOU mocks list endpoint.
 *
 * Two writers land here. `reportIssue` (libs/app-runtime) POSTs a
 * `SlackReportBody` to `${DOU_ENDPOINT}/hello/report` with `save: true`, and the
 * log uploader POSTs batches to `/hello/report-bulk`. A third is now historical:
 * `reportError` filed automatic error reports until it was retired in 2026-09,
 * and its records are still in the store — which is why the `error` kind below
 * outlives the function that produced it.
 *
 * @see chatic-backend-api (deployed backend, `MockListParam` — this repo's installed
 *   `@lemoncloud/chatic-backend-api` SDK package is unrelated/older and does not need to
 *   match) — GET /dou-v1/mocks/0/list, query: `type` (stereo filter), `from`/`to`
 *   (createdAt range, `YYYY-MM-DD`, KST day boundaries, `to` inclusive) + `PaginateParam`.
 */
import { webTransport } from '@chatic/app-runtime';

/**
 * Minimal projection of `MockView` (chatic-backend-api) we actually consume.
 * Kept local (mirrors the socket-lab `deviceApi` convention) so the feature does
 * not depend on the SDK's type re-exports. The report payload is not a top-level
 * field — it lives serialized inside `meta` (object or JSON string) and/or the
 * SlackReportBody `message`; `parseReportLog` unwraps it defensively.
 */
export interface RawMockView {
    id?: string;
    name?: string;
    /** JSON encoding of the stored data (SlackReportBody / report payload, or a `LogEntry`). */
    meta?: unknown;
    ns?: string;
    type?: string;
    stereo?: string;
    uid?: string;
    createdAt?: number;
    updatedAt?: number;
    /** `LogEntry` saves only, hoisted onto the record for server-side filtering — see `level`/`runId` below. */
    level?: string;
    runId?: string;
    cid?: string;
    [key: string]: unknown;
}

/** Aggregation buckets returned alongside the list (shape: { key: { bucket: count } }). */
export type AggrResult = Record<string, Record<string, number>>;

export interface ReportLogListResponse {
    list?: RawMockView[];
    total?: number;
    page?: number;
    limit?: number;
    aggr?: AggrResult | AggrResult[];
}

/** DOU stage: `v1` = prod (where real user reports land), `d1` = dev. */
export type ReportStage = 'v1' | 'd1';

/**
 * Host derived from the configured DOU endpoint, with its `/dou-XX` stage suffix stripped so the
 * stage toggle can swap it. Keeps the endpoint env-configurable instead of hardcoding the host.
 * e.g. `https://api.eureka.codes/dou-d1` → `https://api.eureka.codes`.
 */
const DOU_BASE = (import.meta.env.VITE_DOU_ENDPOINT ?? '').replace(/\/dou-[^/]*\/?$/, '');

/** Report kind as offered in the UI; `all` means "no server-side kind filter". */
export type ReportKind = 'all' | 'error' | 'issue' | 'log-entry';

/**
 * UI kind → stored `stereo`. Errors saved as `log` and user issues as `issue` — the names
 * deliberately differ, so keep this mapping rather than passing the UI value straight through.
 *
 * `log-entry` (batch-uploaded structured logs) shares the `log` stereo with `error` —
 * they are not separated server-side yet (log-batch-ingest SPEC.md D6) — so selecting
 * either fetches the same `stereo=log` bucket and `parseReportLog` splits it client-side.
 *
 * `error` is a **historical** kind since `reportError` was retired (2026-09): nothing writes
 * those records any more, but the stored ones stay readable and the filter stays useful for
 * anything before that date. New errors arrive as `log-entry`.
 */
export const STEREO_BY_KIND: Record<ReportKind, string | undefined> = {
    all: undefined,
    error: 'log',
    issue: 'issue',
    'log-entry': 'log',
};

export interface FetchReportLogsParams {
    page?: number;
    limit?: number;
    stage?: ReportStage;
    /**
     * (optional) server-side kind filter, matched against the record's `stereo.keyword`.
     * Errors and log entries save as `log`, user issues as `issue`; omit for no filter.
     * Narrowing here also narrows `total`, so the caller's page count follows the filter
     * instead of the full dataset.
     */
    type?: string;
    /** (optional) createdAt range start, `YYYY-MM-DD` (KST day start, server-side). */
    from?: string;
    /** (optional) createdAt range end, `YYYY-MM-DD` (KST day end, inclusive, server-side). */
    to?: string;
    /**
     * (optional) `LogEntry.level` filter, e.g. `error`/`warn`/`info` (chatic-backend-api
     * log-batch-ingest SPEC.md §3 — hoisted onto the model alongside `uid`/`cid`/`runId`
     * for exactly this). Slack reports never set `level`, so this incidentally narrows to
     * batch log entries.
     */
    level?: string;
    /** (optional) `LogEntry.runId` filter — isolate one app run's logs. */
    runId?: string;
}

/**
 * Query params for the list call. Filters are included only when non-empty — the
 * backend treats an absent key as "no filter", but an empty string would be matched
 * literally against `stereo.keyword` / rejected by the date parser.
 */
export const buildReportLogListParams = ({
    page = 0,
    limit = 100,
    type,
    from,
    to,
    level,
    runId,
}: FetchReportLogsParams = {}): Record<string, string | number> => ({
    page,
    limit,
    ...(type ? { type } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(level ? { level } : {}),
    ...(runId ? { runId } : {}),
});

/**
 * Fetch a page of stored reports. The backend paginates (verified: total ~7.7k,
 * default limit 100), so the page/limit params drive server-side pagination.
 * `type`/`from`/`to`/`level`/`runId` filter server-side (against the FULL dataset —
 * so pagination and the group/time samples respect the range); free-text search
 * remains a client-side filter over the fetched page.
 */
export const fetchReportLogs = async ({
    page = 0,
    limit = 100,
    stage = 'v1',
    type,
    from,
    to,
    level,
    runId,
}: FetchReportLogsParams = {}): Promise<ReportLogListResponse> => {
    const { data } = await webTransport
        .buildSignedRequest({
            method: 'GET',
            baseURL: `${DOU_BASE}/dou-${stage}/mocks/0/list`,
        })
        .setParams(buildReportLogListParams({ page, limit, type, from, to, level, runId }))
        .execute<ReportLogListResponse>();
    return data ?? {};
};
