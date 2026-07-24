/**
 * `api/report-logs/reportLogApi.ts`
 * - Reads stored error/issue reports from the DOU mocks list endpoint.
 *
 * Reports are produced by `reportError`/`reportIssue` (libs/web-core), which
 * POST a `SlackReportBody` to `${DOU_ENDPOINT}/hello/report` with `save: true`.
 * This is the read side over the same DOU backend.
 *
 * @see chatic-backend-api #0.26.701 — GET /dou-v1/mocks/0/list
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

export interface FetchReportLogsParams {
    page?: number;
    limit?: number;
    stage?: ReportStage;
}

/**
 * Fetch a page of stored reports. The backend paginates (verified: total ~7.7k,
 * default limit 100), so the page/limit params drive server-side pagination.
 * Text/date filtering is applied client-side over the current page by the caller.
 */
export const fetchReportLogs = async ({
    page = 0,
    limit = 100,
    stage = 'v1',
}: FetchReportLogsParams = {}): Promise<ReportLogListResponse> => {
    const { data } = await webTransport
        .buildSignedRequest({
            method: 'GET',
            baseURL: `${DOU_BASE}/dou-${stage}/mocks/0/list`,
        })
        .setParams({ page, limit })
        .execute<ReportLogListResponse>();
    return data ?? {};
};
