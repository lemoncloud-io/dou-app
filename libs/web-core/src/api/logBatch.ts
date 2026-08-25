import { DOU_ENDPOINT } from '../session/core';
import { webTransport } from '../transport';
import { toWireLogBatch } from '@chatic/bridges';

import type { UploadOutcome } from '@chatic/bridges';
import type { LogEntry } from '@chatic/bridges';

/**
 * Ships a batch of log entries to the collector.
 *
 * Two things about this function are load-bearing.
 *
 * It calls `webTransport.buildSignedRequest` directly instead of going through
 * `executeSignedRelayRequest`, because only the latter is wrapped in
 * `withNetworkLog`. Logging this request would close a loop: an upload failure
 * becomes an error entry, the error entry advances the next flush, the retry
 * fails again. `reportError` avoids the interceptor the same way, for the same
 * reason.
 *
 * And it never calls `logger`. Its own failures go to `console` only — when the
 * log transport is what is broken, logging about it has nowhere to go.
 */

const LOG_BATCH_ENDPOINT = `${DOU_ENDPOINT}/hello/report-bulk`;

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
        await webTransport
            .buildSignedRequest({
                method: 'POST',
                baseURL: LOG_BATCH_ENDPOINT,
            })
            .setBody(toWireLogBatch(entries))
            .execute();

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
