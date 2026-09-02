import { toWireLogBatch } from '@chatic/bridges';

import { getRepositories } from '../data/runtime';

import type { UploadOutcome } from '@chatic/bridges';
import type { LogEntry } from '@chatic/bridges';

/**
 * Ships a batch of log entries to the collector.
 *
 * Two things about this function are load-bearing.
 *
 * **The request must not be logged.** Logging it would close a loop: an upload
 * failure becomes an error entry, that entry joins the queue this uploader
 * drains, and the next flush carries the record of its own last failure —
 * growing the queue on exactly the runs where it cannot be emptied. The opt-out
 * used to be the choice of entry point here (`buildSignedRequest`, the one
 * helper `withNetworkLog` does not wrap); now that the call goes through
 * `report` repository → `ReportHttpGateway` like every other data call
 * (ADR-0036), it is the gateway's `bypass: ['networkLog']` — asserted in
 * `libs/http/src/gateways/report.spec.ts`.
 *
 * **And it never calls `logger`.** Its own failures go to `console` only — when
 * the log transport is what is broken, logging about it has nowhere to go. That
 * holds for everything below it too: neither the repository nor the data source
 * logs, and both re-throw untouched so the status this classifies survives.
 */

/** Reads an HTTP status off an axios-shaped error, defensively. */
const readStatus = (error: unknown): number | undefined => {
    const err = error as { status?: unknown; response?: { status?: unknown }; statusCode?: unknown };
    const status = err?.status ?? err?.response?.status ?? err?.statusCode;
    return typeof status === 'number' ? status : undefined;
};

/**
 * 4xx means the request will never be accepted as-is — a malformed list, a
 * rejected shape — so the batch is discarded rather than retried. Everything
 * else (5xx, offline, timeout) is worth another attempt. The scheduler caps how
 * many, so this classification alone does not decide termination.
 *
 * 401/403 are the exception: they say "not signed in *right now*", which on
 * this device is a passing state, not a verdict on the batch. Signing out and
 * back in as someone else is an ordinary path here, and the queue deliberately
 * survives logout because entries carry the uid/cid they were stamped with —
 * discarding on 401 would throw away exactly the entries a session problem
 * leaves behind, moments before the next session could have shipped them.
 */
const AUTH_STATUSES = new Set([401, 403]);

const classify = (error: unknown): UploadOutcome => {
    const status = readStatus(error);
    if (status !== undefined && AUTH_STATUSES.has(status)) return 'retry';
    if (status !== undefined && status >= 400 && status < 500) return 'discard';
    return 'retry';
};

export const uploadLogBatch = async (entries: LogEntry[]): Promise<UploadOutcome> => {
    if (!entries.length) return 'ok';

    try {
        // Resolved per call, not at module load: the uploader boots before the app configures the
        // data runtime (apps/web `main.tsx`), and a flush only ever happens after that.
        await getRepositories().report.uploadLogBatch(toWireLogBatch(entries));

        // 2xx: accepted. Individual entries the server dropped are reported in
        // the body, but they are not worth resending — it already refused them.
        return 'ok';
    } catch (error) {
        const outcome = classify(error);
        // console, never logger — see the note above.

        console.warn('[logBatch] upload failed', { outcome, status: readStatus(error) });
        return outcome;
    }
};
