import { toLogEntry } from '@chatic/bridges';

import { appBridge } from '../../bridge/appBridge';

import type { LogStoreReader } from '@chatic/bridges';

/**
 * The app's log store, reached over the bridge, as a `LogStoreReader`
 * (ADR-0063). The `AppLogInfo` ↔ `LogEntry` mapping both directions share now
 * lives with the bridge protocol in `@chatic/bridges` (`appLogInfoCodec`). The principle here: the outermost
 * shell owns the store, and the consumer is told which one to use at boot
 * rather than branching on `isNative()` internally.
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

/**
 * Size the app reported on the last round trip.
 *
 * Module scope for the same reason `uploadQueueUnsupported` is: there is one
 * installed app, so there is one store. Zero until the first trip answers —
 * callers that need to tell "empty" from "not asked yet" must look at `peek`.
 */
let lastKnownSize = 0;

/** Test seam — resets the learned fallback. */
export const resetNativeUploadQueueSupport = (): void => {
    uploadQueueUnsupported = false;
    lastKnownSize = 0;
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
 * Builds the reader that draws from the app's store.
 *
 * Deliberately an object literal rather than a class. It stores nothing — every
 * call goes straight over the bridge — so naming it `...LogStore` would claim
 * something untrue, and there is no state for a class to hold.
 *
 * `peek` returning empty is not the same as the store being unavailable — the
 * caller cannot tell the difference and does not need to, because an empty batch
 * and an unreachable store both mean "nothing ships this cycle". What it must
 * not do is release anything, and it does not: `ack` is the only release.
 */
export const createNativeUploadSource = (): LogStoreReader => ({
    async peek(limit) {
        if (uploadQueueUnsupported) return [];

        try {
            const response = await appBridge.fetchLogUploadQueue(limit);
            if (!response?.success) return [];
            if (typeof response.data?.size === 'number') lastKnownSize = response.data.size;
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
            const response = await appBridge.ackLogUploadQueue(ids);
            if (typeof response?.data?.size === 'number') lastKnownSize = response.data.size;
        } catch (error) {
            if (isUnsupported(error)) uploadQueueUnsupported = true;
            // Otherwise the entries stay in the app queue and ride the next
            // batch. The server upserts on id, so a resend costs bandwidth, not
            // correctness.
        }
    },

    async clear() {
        await clearNativeLogQueue();
    },

    /**
     * The count the last round trip reported, not a fresh one.
     *
     * Both `FetchLogUploadQueue` and `AckLogUploadQueue` answer with the store's
     * size, so this is free. It is a display value for the debug monitor — the
     * uploader does not read it, having no size trigger to drive — and being one
     * cycle stale is fine for that. Asking across the bridge on every read would
     * cost a round trip for a number nothing decides on.
     */
    size: () => lastKnownSize,
});
