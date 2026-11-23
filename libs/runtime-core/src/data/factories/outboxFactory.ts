import { logger } from '@chatic/logger';
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
import { backgroundClouds, getSocketManager, getSocketErrorCode, kindOf, slotKeyOf } from '@chatic/transport';
import type { SocketKind } from '@chatic/transport';

export const OUTBOX_RETRY_DELAYS_MS: readonly number[] = [2_000, 5_000, 15_000];

export const isOutboxRefusal = (error: unknown): boolean => {
    const code = getSocketErrorCode(error);
    return code !== undefined && code >= 400 && code < 500 && code !== 408 && code !== 429 && code !== 499;
};

const cloudOf = (cid: string): string => cid || RELAY_CLOUD_ID;

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

export interface StateOutboxSample {
    op: OutboxOp;
    kind: SocketKind;
    outcome: OutboxSettleOutcome;
    deliveryMs: number;
    waitSocketMs: number;
    attempts: number;
}

let sampleObserver: ((sample: StateOutboxSample) => void) | undefined;

export const setStateOutboxObserver = (observer: ((sample: StateOutboxSample) => void) | undefined): void => {
    sampleObserver = observer;
};

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

export const createRuntimeOutbox = (graphOf: (cid: string) => DataRepositories): OutboxPort =>
    createStateOutbox({
        specs: STATE_SPECS,
        transport: createOutboxTransport(graphOf),
        observer: runtimeOutboxObserver,
    });
