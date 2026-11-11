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
 * Size the app reported on the last round trip.
 *
 * Module scope: there is one installed app, so there is one store. Zero until
 * the first trip answers — callers that need to tell "empty" from "not asked
 * yet" must look at `peek`.
 */
let lastKnownSize = 0;

/** Test seam — forgets the last reported size. */
export const resetNativeUploadQueueSize = (): void => {
    lastKnownSize = 0;
};

/** Drops the app's upload queue. Device opt-out only. */
export const clearNativeLogQueue = async (): Promise<void> => {
    try {
        await appBridge.clearLogUploadQueue();
    } catch {
        // Transient; the next opt-out check tries again.
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
        try {
            const response = await appBridge.fetchLogUploadQueue(limit);
            if (!response?.success) return [];
            if (typeof response.data?.size === 'number') lastKnownSize = response.data.size;
            return (response.data?.logs ?? []).map(toLogEntry);
        } catch {
            return [];
        }
    },

    async ack(entries) {
        // ids are what goes on the wire; entries without one cannot be released
        // remotely, but the app stamps every entry at charge time so this filter
        // is a guard rather than a real case.
        const ids = entries.map(entry => entry.id).filter((id): id is string => Boolean(id));
        if (!ids.length) return;

        try {
            const response = await appBridge.ackLogUploadQueue(ids);
            if (typeof response?.data?.size === 'number') lastKnownSize = response.data.size;
        } catch {
            // The entries stay in the app queue and ride the next batch. The
            // server upserts on id, so a resend costs bandwidth, not correctness.
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
