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
import { runtime } from '@chatic/app-runtime';

/**
 * Minimal projection of `MockView` (chatic-backend-api) we actually consume.
 * Kept local so the feature does not depend on the SDK's type re-exports. The report payload is not a top-level
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
    sid?: string;
    [key: string]: unknown;
}

/** Aggregation buckets returned alongside the list (shape: { key: { bucket: count } }). */
export type AggrResult = Record<string, Record<string, number>>;

/** One bucket of a server aggregation: a field value or a bucket start, and how many records. */
export interface StatsBucket {
    key: string;
    val: number;
}

/**
 * The list endpoint's aggregation, present only when `groupBy`, `interval` or `users` was asked
 * for — and only from a backend that has the feature. An older one ignores the three parameters
 * and answers without `stats`, which is how a caller tells "not supported" from "zero".
 */
export interface LogListStats {
    /** Per requested field, the most frequent values first. */
    groups?: Record<string, StatsBucket[]>;
    /** Per time bucket (arrival time, Korean boundaries), oldest first. `users` only when asked for. */
    trend?: Array<{ key: number; val: number; users?: number }>;
    /** Distinct users across the whole match — an approximate count. */
    users?: number;
}

export interface ReportLogListResponse {
    list?: RawMockView[];
    total?: number;
    page?: number;
    limit?: number;
    aggr?: AggrResult | AggrResult[];
    stats?: LogListStats;
}

/** Fields the server can count by. Anything else is refused with a 400 before the search runs. */
export const STATS_GROUP_FIELDS = [
    'tag',
    'level',
    'appVersion',
    'webVersion',
    'route',
    'os',
    'osVersion',
    'model',
] as const;

export type StatsGroupField = (typeof STATS_GROUP_FIELDS)[number];

/** Time bucket widths the server accepts, on arrival time with Korean boundaries. */
export type StatsInterval = 'hour' | 'day' | 'week';

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
    /**
     * (optional) user-id filter. Handled explicitly by the backend's `packSearchParam`
     * (chatic-backend-api `abstract-services.ts`), not via the model mapping the other
     * axes go through — which is why it works without a `MockModel` field of its own.
     *
     * Only records that carry a hoisted `uid` match: `saveLogEntry` sets it from
     * `LogEntry.uid`, so batch log entries do. Slack reports (`doPostSlack`) never
     * stamp one, so a user's own issue reports do NOT come back under this filter.
     */
    uid?: string;
    /** (optional) cloud-id filter — `MockModel.cid`, hoisted by `saveLogEntry`. */
    cid?: string;
    /**
     * Round 2 axes (a second backend change): `tag`, the two versions, `route` and the three
     * device fields, lifted to top-level copies so they can be filtered on. Round 1 lifted
     * `sid`/`uid`/`cid`/`runId`/`level` and left these inside `meta`, where no filter reaches.
     *
     * **Exact match, single value.** They go out as `term: {'<field>.keyword': v}`, so there is no
     * range (`appVersion >= 1.4.0`), no prefix (`route` starting `/chat/`) and no OR within one
     * axis. Widening that is a `doGetList` change, not a field change.
     *
     * **Only records written after the backend deploy carry them.** There is no backfill — a full
     * rewrite would be a table scan without a GSI — so narrowing on any of these silently excludes
     * everything older. The full-log tab's filter rail says so where these can be set.
     */
    tag?: string;
    appVersion?: string;
    webVersion?: string;
    route?: string;
    os?: string;
    osVersion?: string;
    model?: string;
    /**
     * Aggregation, all optional and all over the same match as the list. `groupBy` counts per
     * field value (top `aggrSize`, server default 20, at most 100), `interval` counts per time
     * bucket, `users` counts distinct users — overall, and per bucket when `interval` is set.
     * The counts cover the whole match, not the page, which is what lets a screen count past
     * the rows it fetched.
     */
    groupBy?: readonly StatsGroupField[];
    aggrSize?: number;
    interval?: StatsInterval;
    users?: boolean;
}

/**
 * The round-2 axes, as one list — so the params builder, the corpus key and the caveat copy
 * cannot disagree about which filters carry this restriction.
 */
export const ROUND_2_AXES = ['tag', 'appVersion', 'webVersion', 'route', 'os', 'osVersion', 'model'] as const;

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
    uid,
    cid,
    groupBy,
    aggrSize,
    interval,
    users,
    ...rest
}: FetchReportLogsParams = {}): Record<string, string | number> => ({
    page,
    limit,
    ...(type ? { type } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(level ? { level } : {}),
    ...(runId ? { runId } : {}),
    ...(uid ? { uid } : {}),
    ...(cid ? { cid } : {}),
    // Same "omit when empty" rule as the axes above: the backend reads an absent key as no
    // filter, while an empty string would be matched literally against `<field>.keyword` and
    // return nothing. Spread from a list so adding an axis is one edit, not two.
    ...Object.fromEntries(ROUND_2_AXES.flatMap(axis => (rest[axis] ? [[axis, rest[axis] as string]] : []))),
    // Absent unless asked for: with none of these the server's query and answer are unchanged.
    ...(groupBy?.length ? { groupBy: groupBy.join(',') } : {}),
    ...(groupBy?.length && aggrSize ? { aggrSize } : {}),
    ...(interval ? { interval } : {}),
    ...(users ? { users: 1 } : {}),
});

/**
 * Fetch a page of stored reports. The backend paginates (verified: total ~7.7k,
 * default limit 100), so the page/limit params drive server-side pagination.
 * `type`/`from`/`to`/`level`/`runId`/`uid`/`cid` filter server-side (against the FULL
 * dataset), so pagination and every derived count respect the range.
 *
 * No `sort` param is sent on purpose. The backend already defaults to
 * `createdAt: desc` (`addSortTerm`), and passing `sort=createdAt` without an explicit
 * `:desc` flips it to ASCENDING (`asc || 'asc'`) — so the safe way to get newest-first
 * is to send nothing. `collectCorpus` and the new-log probe both rely on page 0 being
 * the newest page.
 */
export const fetchReportLogs = async ({
    stage = 'v1',
    ...params
}: FetchReportLogsParams = {}): Promise<ReportLogListResponse> => {
    const { data } = await runtime.boot.webTransport
        .buildSignedRequest({
            method: 'GET',
            baseURL: `${DOU_BASE}/dou-${stage}/mocks/0/list`,
        })
        .setParams(buildReportLogListParams(params))
        .execute<ReportLogListResponse>();
    return data ?? {};
};

/**
 * No `AbortSignal` here on purpose. `SealedWebTransport`'s request builder exposes only
 * `setBody`/`setParams`/`execute` (libs/http `lemonTransport.ts`) — a deliberately narrow
 * surface, and widening it for this screen is outside this change. So cancellation is
 * cooperative instead: `collectCorpus` stops between pages and `useLogCorpus` discards a
 * late response by generation, which costs at most one wasted in-flight page per filter
 * change.
 */
