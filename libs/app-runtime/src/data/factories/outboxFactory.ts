import { logger } from '@chatic/bridges';
import { createStateOutbox, RELAY_CLOUD_ID, STATE_SPECS } from '@chatic/data';
import type {
    DataRepositories,
    OutboxObserver,
    OutboxOp,
    OutboxPort,
    OutboxSettleOutcome,
    OutboxTransport,
} from '@chatic/data';
import { isPageHidden, pageHideCount, perfNow } from '@chatic/perf';

import { getUidInCloud } from '@chatic/session';
import { backgroundClouds } from '../../socket/backgroundClouds';
import { getSocketManager } from '../../socket/runtime';
import { getSocketErrorCode } from '../../socket/utils/socketErrorCode';
import { kindOf, slotKeyOf } from '../../socket/utils/slotKey';
import type { SocketKind } from '../../socket/types';

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

/** One state write's trip to the server, as it settled. What `setStateOutboxObserver` is handed. */
export interface StateOutboxSample {
    op: OutboxOp;
    kind: SocketKind;
    outcome: OutboxSettleOutcome;
    /** From the set that made the key wait to the answer that ended the wait, on the page's monotonic clock. */
    deliveryMs: number;
    /** The part of `deliveryMs` the cloud's socket was not verified. */
    waitSocketMs: number;
    /** The request that ended the wait plus each failed one sent again; for an account change only the failed ones. */
    attempts: number;
}

// Who is told each settled state write. Unset, the outbox reads no clock.
let sampleObserver: ((sample: StateOutboxSample) => void) | undefined;

/**
 * Hands every state write this runtime's outbox settles to `observer`, or stops when `undefined` — one
 * process-wide observer, a later call replaces it. A wait is reported only to the observer set both
 * when it began and when it settled, so stopping stops at once.
 */
export const setStateOutboxObserver = (observer: ((sample: StateOutboxSample) => void) | undefined): void => {
    sampleObserver = observer;
};

/**
 * The machine's observer, as this runtime fills it. A wait that began while the page was hidden, or
 * that the page was hidden during, is not handed over: it would time the OS suspending the page —
 * a socket left down in the background, a write held until the return — not a wait anyone sat through.
 */
export const runtimeOutboxObserver: OutboxObserver = {
    now: perfNow,
    begin: () => {
        const observer = sampleObserver;
        if (!observer || isPageHidden()) return undefined;
        const hidesAtStart = pageHideCount();
        return ({ op, cid, outcome, deliveryMs, waitSocketMs, attempts }) => {
            if (sampleObserver !== observer || pageHideCount() !== hidesAtStart) return;
            try {
                observer({
                    op,
                    kind: kindOf(slotKeyOf(cloudOf(cid))),
                    outcome,
                    deliveryMs: Math.round(deliveryMs),
                    waitSocketMs: Math.round(waitSocketMs),
                    attempts,
                });
            } catch (error) {
                logger.warn('PERF', '[outbox] state outbox observer threw', { error, data: { op } });
            }
        };
    },
};

/** The one outbox every repository graph of this runtime shares. */
export const createRuntimeOutbox = (graphOf: (cid: string) => DataRepositories): OutboxPort =>
    createStateOutbox({
        specs: STATE_SPECS,
        transport: createOutboxTransport(graphOf),
        observer: runtimeOutboxObserver,
    });
