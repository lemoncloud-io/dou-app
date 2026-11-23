import { toLogEntry } from '@chatic/bridges';

import { appBridge } from '../../bridge/appBridge';

import type { LogStoreReader } from '@chatic/bridges';

let lastKnownSize = 0;

export const resetNativeUploadQueueSize = (): void => {
    lastKnownSize = 0;
};

export const clearNativeLogQueue = async (): Promise<void> => {
    try {
        await appBridge.clearLogUploadQueue();
    } catch {
        // Transient; the next opt-out check tries again.
    }
};

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

    size: () => lastKnownSize,
});
