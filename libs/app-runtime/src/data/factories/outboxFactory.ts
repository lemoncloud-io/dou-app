import { createStateOutbox, RELAY_CLOUD_ID, STATE_SPECS } from '@chatic/data';
import type { DataRepositories, OutboxPort, OutboxTransport } from '@chatic/data';

import { getUidInCloud } from '../../session/store';
import { backgroundClouds } from '../../socket/backgroundClouds';
import { getSocketManager } from '../../socket/runtime';
import { getSocketErrorCode } from '../../socket/utils/socketErrorCode';
import { slotKeyOf } from '../../socket/utils/slotKey';

/** Short enough to beat the next user action, few enough that a dead socket costs three requests. */
export const OUTBOX_RETRY_DELAYS_MS: readonly number[] = [2_000, 5_000, 15_000];

/**
 * A 4xx other than a timeout (408), a rate limit (429) or a closed socket (499) is the server deciding
 * this value can never land — I left the room, say, or it is gone.
 */
export const isOutboxRefusal = (error: unknown): boolean => {
    const code = getSocketErrorCode(error);
    return code !== undefined && code >= 400 && code < 500 && code !== 408 && code !== 429 && code !== 499;
};

/** A missing cloud id is the relay, the same normalisation the selected context applies. */
const cloudOf = (cid: string): string => cid || RELAY_CLOUD_ID;

/**
 * The runtime half of the state outbox (`@chatic/data` `outbox/`): when each cloud can carry a
 * request, and through which graph it goes. `libs/data` decides what is sent and how values combine;
 * the connection's lifecycle and timing are this package's, so they come in through the transport.
 *
 * - **Ready** is the cloud's own slot being verified (`subscribeSlotVerified`), not the active
 *   slot's: a write to a cloud off screen waits for that cloud's socket, never the selected one's.
 * - **Delivery** runs in the cloud's scoped graph, whose socket is that cloud's slot, while the slot
 *   is held (`backgroundClouds.hold`) so a switch meanwhile cannot tear it down. A cloud with no slot
 *   bound keeps its writes until it has one: a hold keeps a slot, it does not open one.
 * - `getSocketManager()` is resolved per call: the runtime is assembled lazily.
 */
export const createOutboxTransport = (graphOf: (cid: string) => DataRepositories): OutboxTransport => ({
    watchReady: (cid, listener) => getSocketManager().subscribeSlotVerified(slotKeyOf(cloudOf(cid)), listener),
    inCloud: async (cid, work) => {
        const cloud = cloudOf(cid);
        const release = backgroundClouds.hold(cloud);
        try {
            return await work(graphOf(cloud));
        } finally {
            release();
        }
    },
    uidOf: cid => getUidInCloud(cloudOf(cid)) ?? null,
    isRefusal: isOutboxRefusal,
    retryDelaysMs: OUTBOX_RETRY_DELAYS_MS,
    setTimer: (callback, ms) => setTimeout(callback, ms),
    clearTimer: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
});

/** The one outbox every repository graph of this runtime shares. */
export const createRuntimeOutbox = (graphOf: (cid: string) => DataRepositories): OutboxPort =>
    createStateOutbox({ specs: STATE_SPECS, transport: createOutboxTransport(graphOf) });
