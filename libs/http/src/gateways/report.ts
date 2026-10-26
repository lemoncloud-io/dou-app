import type { SlackReportBody, SlackReportResult } from '@lemoncloud/chatic-archive-api';
import type { HttpGatewayExecutor } from './types';

/**
 * `/hello/report` body. `stereo` is the stored record's KIND and admin's server-side filter
 * (`MockListParam.type`).
 */
export type IssueReportWireBody = SlackReportBody;

/**
 * The archive service's address, built from the relay's: the trailing `/dou-<stage>` path segment
 * becomes `/arc-<stage>` (`https://host/dou-d1` → `https://host/arc-d1`).
 *
 * Built rather than configured because the relay is read in one place, and a deep-linked relay
 * (`?_backend=`) has to send its logs to the archive of its own stage — a dev session's logs must
 * not land in prod. A relay with no stage segment (a local backend) is returned as it is, so those
 * reports reach the old route on the relay; that only works while the server keeps it open.
 */
export const archiveEndpointFor = (relay: string): string =>
    relay
        .trim()
        .replace(/\/+$/, '')
        .replace(/\/dou-([^/]+)$/, '/arc-$1');

/**
 * `/hello/report-bulk` body — the envelope-less `{ list }` the collector expects.
 *
 * Declared structurally on purpose: `@chatic/logger`'s `toWireLogBatch` produces exactly this, but
 * this lib imports nothing from `@chatic/*` and stays a leaf, so the shape is restated rather than
 * imported.
 */
export interface LogBatchWireBody {
    list: unknown[];
}

/**
 * `/hello/report*` wire vocabulary — the user's own issue reports and the log batches the uploader
 * drains.
 *
 * Both routes were built inline against `webTransport.buildSignedRequest` until 2026-09 (they were
 * the last two data calls in the repo that skipped the gateway layer entirely). Since 2026-10 they go
 * to the archive service (`archiveEndpointFor`), still signed with the relay session — only the
 * address moved. The relay is read on every call, so the deeplink `?_backend` override is honored
 * like on every other relay call.
 */
export interface ReportHttpGateway {
    /** POST {archive}/hello/report — a report the USER wrote (automatic error reports were retired in
     * 2026-09; errors ride the log batch below). */
    reportIssue(body: IssueReportWireBody): Promise<SlackReportResult>;
    /** POST {archive}/hello/report-bulk, `bypass: ['networkLog']` + `allowRecordError` — see below. */
    uploadLogBatch(body: LogBatchWireBody): Promise<unknown>;
}

export const createReportHttpGateway = (exec: HttpGatewayExecutor): ReportHttpGateway => {
    const archive = () => archiveEndpointFor(exec.resolveEndpoint('relay'));

    return {
        reportIssue: body =>
            exec.executeSignedRelayRequest<SlackReportResult, IssueReportWireBody>({
                method: 'POST',
                baseURL: `${archive()}/hello/report`,
                body,
            }),

        uploadLogBatch: body =>
            exec.executeSignedRelayRequest<unknown, LogBatchWireBody>({
                method: 'POST',
                baseURL: `${archive()}/hello/report-bulk`,
                body,
                // The one request in the app that must NOT be logged. Logging it would close a loop:
                // an upload failure becomes an error entry, that entry joins the queue this call
                // drains, and the next flush carries the record of its own last failure — growing
                // the queue on exactly the runs that cannot empty it. @see ../policy/bypass.ts
                bypass: ['networkLog'],
                // The 200 body reports per-entry drops (`{ total, dropped, list }`). Those are the
                // collector's verdict on individual entries, not a failed call, so the body must
                // not be turned into a throw — the uploader would classify it as retryable and
                // resend a batch the server already accepted.
                allowRecordError: true,
            }),
    };
};
