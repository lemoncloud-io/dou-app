import type { SlackReportBody, SlackReportResult } from '@lemoncloud/chatic-backend-api';
import type { HttpGatewayExecutor } from './types';

/**
 * `/hello/report` body. `stereo` is the stored record's KIND and admin's server-side filter
 * (`MockListParam.type`) — the deployed backend accepts it, but the installed
 * `@lemoncloud/chatic-backend-api` SDK type does not carry it yet, so it is added here as a cross
 * type. Drop the intersection once the SDK catches up.
 */
export type IssueReportWireBody = SlackReportBody & { stereo?: string };

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
 * `/hello/report*` relay resource wire vocabulary — the user's own issue reports and the log
 * batches the uploader drains.
 *
 * Both routes were built inline against `webTransport.buildSignedRequest` until 2026-09 (they were
 * the last two data calls in the repo that skipped the gateway layer entirely). The host they hit is
 * unchanged — `resolveEndpoint('relay')` reads the same `DOU_ENDPOINT` the old constants did, with
 * the deeplink `?_backend` override now honored like every other relay call.
 */
export interface ReportHttpGateway {
    /** POST {relay}/hello/report — a report the USER wrote (automatic error reports were retired in
     * 2026-09; errors ride the log batch below). */
    reportIssue(body: IssueReportWireBody): Promise<SlackReportResult>;
    /** POST {relay}/hello/report-bulk, `bypass: ['networkLog']` + `allowRecordError` — see below. */
    uploadLogBatch(body: LogBatchWireBody): Promise<unknown>;
}

export const createReportHttpGateway = (exec: HttpGatewayExecutor): ReportHttpGateway => {
    const relay = () => exec.resolveEndpoint('relay');

    return {
        reportIssue: body =>
            exec.executeSignedRelayRequest<SlackReportResult, IssueReportWireBody>({
                method: 'POST',
                baseURL: `${relay()}/hello/report`,
                body,
            }),

        uploadLogBatch: body =>
            exec.executeSignedRelayRequest<unknown, LogBatchWireBody>({
                method: 'POST',
                baseURL: `${relay()}/hello/report-bulk`,
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
