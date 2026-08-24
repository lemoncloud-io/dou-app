import { markBatchRelayActive, toAppLogInfo } from '@chatic/bridges';

import { appBridge } from './appBridge';
import { toLogEntry } from './nativeLogSource';

import type { LogEntry, LogUploadSource } from '@chatic/bridges';

/**
 * The app's upload queue, reached over the bridge, as a `LogUploadSource`
 * (ADR-0063). Sibling to `nativeLogSource` — that one routes report
 * breadcrumbs to the native merged buffer, this one routes the upload batch to
 * the native queue. Same principle in both: the outermost shell owns the store,
 * and the consumer is told which one to use at boot rather than branching on
 * `isNative()` internally.
 *
 * Nothing in here calls `logger`. This is the upload path, and a log emitted
 * from it would feed the very queue it is draining.
 */

/**
 * Whether the installed app predates these messages.
 *
 * The web ships ahead of the app, so this code runs inside builds whose host has
 * no handler for it — `AppBridgeHost` answers `NOT_FOUND`, and one such answer
 * is enough to stop trying for the rest of the session.
 *
 * The handshake's `supportedWebMessages` is deliberately NOT used. It arrives
 * asynchronously and would race the first flush, and it is derived from the
 * installed build's compiled message map rather than from handlers actually
 * registered — so it can claim support that is not there. Learning from a real
 * rejection has neither problem. Same reasoning as `NativeDBAdapter`'s
 * `batchReadUnsupported`.
 *
 * Module scope is intentional: there is one installed app, so there is one
 * answer.
 */
let uploadQueueUnsupported = false;

/** Test seam — resets the learned fallback. */
export const resetNativeUploadQueueSupport = (): void => {
    uploadQueueUnsupported = false;
};

/** Whether the bridge upload queue is known to be unavailable in this app build. */
export const isNativeUploadQueueUnsupported = (): boolean => uploadQueueUnsupported;

/**
 * True when this rejection means "the installed app does not know this message".
 *
 * Only `NOT_FOUND` qualifies. A timeout or a transport error must NOT be learned
 * from — those are transient, and treating one as a permanent capability verdict
 * would strand the app queue for the whole session over a single slow round trip.
 */
const isUnsupported = (error: unknown): boolean => (error as { code?: string })?.code === 'NOT_FOUND';

/**
 * Hands a batch of web-side entries to the app (the *charge*).
 *
 * Returns the app queue's size on success so the uploader can drive its size
 * trigger from it, or `undefined` when the batch did not land — the caller keeps
 * the entries in that case.
 */
export const chargeNativeLogQueue = async (entries: LogEntry[]): Promise<number | undefined> => {
    if (!entries.length || uploadQueueUnsupported) return undefined;

    try {
        const response = await appBridge.sendLogBatch(entries.map(toAppLogInfo));
        if (!response?.success) return undefined;

        // The app has taken a batch, so the per-entry relay can stand down: both
        // paths file into the same ring buffer and it does not dedup. Marked on
        // success rather than on the attempt — a build that answers NOT_FOUND
        // still needs the per-entry path, and stopping it early would leave its
        // buffer with no web entries at all.
        markBatchRelayActive();

        return response.data?.size;
    } catch (error) {
        if (isUnsupported(error)) {
            uploadQueueUnsupported = true;
            console.warn('[nativeUploadSource] app build has no log upload queue — staying on the web queue');
        }
        return undefined;
    }
};

/** Drops the app's upload queue. Device opt-out only. */
export const clearNativeLogQueue = async (): Promise<void> => {
    if (uploadQueueUnsupported) return;

    try {
        await appBridge.clearLogUploadQueue();
    } catch (error) {
        if (isUnsupported(error)) uploadQueueUnsupported = true;
        // Any other failure is transient; the next opt-out check tries again.
    }
};

/**
 * Builds the source that draws from the app queue.
 *
 * `fetch` returning empty is not the same as the queue being unavailable — the
 * caller cannot tell the difference and does not need to, because an empty
 * batch and an unreachable source both mean "nothing ships this cycle". What it
 * must not do is release anything, and it does not: `ack` is the only release.
 */
export const createNativeUploadSource = (): LogUploadSource => ({
    async fetch(limit) {
        if (uploadQueueUnsupported) return [];

        try {
            const response = await appBridge.fetchLogUploadQueue(limit);
            if (!response?.success) return [];
            return (response.data?.logs ?? []).map(toLogEntry);
        } catch (error) {
            if (isUnsupported(error)) {
                uploadQueueUnsupported = true;
                console.warn('[nativeUploadSource] app build has no log upload queue — staying on the web queue');
            }
            return [];
        }
    },

    async ack(entries) {
        // ids are what goes on the wire; entries without one cannot be released
        // remotely, but the app stamps every entry at charge time so this filter
        // is a guard rather than a real case.
        const ids = entries.map(entry => entry.id).filter((id): id is string => Boolean(id));
        if (!ids.length || uploadQueueUnsupported) return;

        try {
            await appBridge.ackLogUploadQueue(ids);
        } catch (error) {
            if (isUnsupported(error)) uploadQueueUnsupported = true;
            // Otherwise the entries stay in the app queue and ride the next
            // batch. The server upserts on id, so a resend costs bandwidth, not
            // correctness.
        }
    },

    // No synchronous answer: asking the app would cost a bridge round trip per
    // dispatched log line, which is what batching exists to avoid. The uploader
    // drives its size trigger from the count each charge response reports.
    pendingSize: () => undefined,
});
