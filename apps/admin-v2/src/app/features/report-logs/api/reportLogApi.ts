/**
 * `api/report-logs/reportLogApi.ts`
 * - Reads stored error/issue reports from the DOU mocks list endpoint.
 *
 * Reports are produced by `reportError`/`reportIssue` (libs/web-core), which
 * POST a `SlackReportBody` to `${DOU_ENDPOINT}/hello/report` with `save: true`.
 * This is the read side over the same DOU backend.
 *
 * @see chatic-backend-api (deployed backend, `MockListParam` — this repo's installed
 *   `@lemoncloud/chatic-backend-api` SDK package is unrelated/older and does not need to
 *   match) — GET /dou-v1/mocks/0/list, query: `type` (stereo filter), `from`/`to`
 *   (createdAt range, `YYYY-MM-DD`, KST day boundaries, `to` inclusive) + `PaginateParam`.
 */
import { webTransport } from '@chatic/web-core';

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
    /** JSON encoding of the stored data (SlackReportBody / report payload). */
    meta?: unknown;
    ns?: string;
    type?: string;
    stereo?: string;
    uid?: string;
    createdAt?: number;
    updatedAt?: number;
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

/** Stereo value the slack-report save path stamps on every stored report. */
export const REPORT_LOG_STEREO = 'log';

export interface FetchReportLogsParams {
    page?: number;
    limit?: number;
    stage?: ReportStage;
    /** (optional) server-side `stereo` filter; reports are stored with stereo `log`. */
    type?: string;
    /** (optional) createdAt range start, `YYYY-MM-DD` (KST day start, server-side). */
    from?: string;
    /** (optional) createdAt range end, `YYYY-MM-DD` (KST day end, inclusive, server-side). */
    to?: string;
}

/**
 * Query params for the list call. Filters are included only when non-empty — the
 * backend treats an absent key as "no filter", but an empty string would be matched
 * literally against `stereo.keyword` / rejected by the date parser.
 */
export const buildReportLogListParams = ({ page = 0, limit = 100, type, from, to }: FetchReportLogsParams = {}): Record<
    string,
    string | number
> => ({
    page,
    limit,
    ...(type ? { type } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
});

/**
 * Fetch a page of stored reports. The backend paginates (verified: total ~7.7k,
 * default limit 100), so the page/limit params drive server-side pagination.
 * `type`/`from`/`to` filter server-side (against the FULL dataset — so pagination
 * and the group/time samples respect the range); free-text search remains a
 * client-side filter over the fetched page.
 */
export const fetchReportLogs = async ({
    page = 0,
    limit = 100,
    stage = 'v1',
    type,
    from,
    to,
}: FetchReportLogsParams = {}): Promise<ReportLogListResponse> => {
    const { data } = await webTransport
        .buildSignedRequest({
            method: 'GET',
            baseURL: `${DOU_BASE}/dou-${stage}/mocks/0/list`,
        })
        .setParams(buildReportLogListParams({ page, limit, type, from, to }))
        .execute<ReportLogListResponse>();
    return data ?? {};
};
