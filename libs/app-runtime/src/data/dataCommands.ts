import type { CacheMetricsSnapshot, ChatSendPayload, DomainChat } from '@chatic/data';
import { logger } from '@chatic/logger';
import type { ClearLocalCachesResult, PageRepositories, RuntimeData, StateOutboxSample } from '@chatic/runtime-core';

import { runtimeEngine } from '../init';
import { readSession } from '../session/sessionReads';

// The data as the app reads and writes it, through the engine it was handed — never the data manager
// or a graph the page builds. On the phone the repositories and their cache may live in another
// process; the engine is what knows where.

/** The engine's data — for the hooks of this package. */
export const runtimeData = (): RuntimeData => runtimeEngine().data;

/**
 * The repositories of one named cloud, whichever cloud is selected — for work that belongs to that
 * cloud, such as a resend queue's or a room's writes.
 */
export const getCloudRepositories = (cid: string): PageRepositories => runtimeData().cloudRepositories(cid);

/** Sends a chat to `cid`, holding that cloud's socket until the ack. */
export const sendChatInCloud = (cid: string, payload: ChatSendPayload): Promise<DomainChat> =>
    runtimeData().sendChatInCloud(cid, payload);

/** Resolves `true` once `cid`'s socket is verified, `false` when `timeoutMs` passes first. */
export const waitForCloudSocket = (cid: string, timeoutMs?: number): Promise<boolean> =>
    runtimeData().waitForCloudSocket(cid, timeoutMs);

/** Rebuilds an invited cloud's cached row when a push or a switch names one the cache lost. Best-effort. */
export const recoverInvitedCloudIfMissing = (cloudId: string | undefined): Promise<void> =>
    runtimeData().recoverInvitedCloud(cloudId);

/** Reads an invited cloud's name from the relay and keeps it. Best-effort. */
export const syncInvitedCloudName = (cloudId: string | undefined): Promise<void> =>
    runtimeData().syncInvitedCloudName(cloudId);

/** Reads a paired cloud's name and keeps it with the paired cloud. Best-effort. */
export const syncPairedCloudName = (cloudId: string | undefined): Promise<void> =>
    runtimeData().syncPairedCloudName(cloudId);

/** Empties every cloud's local cache partition for the signed-in account. */
export const clearLocalCaches = (): Promise<ClearLocalCachesResult> => runtimeData().clearLocalCaches();

/**
 * Asks the next sync pass to start every target from the beginning — for a clear that is not
 * `clearLocalCaches`. Resolves once the request is stored; a caller about to reload waits for it, since
 * on the phone it is written in another process. Never rejects: a failure is logged.
 */
export const requestSyncCursorReset = (): Promise<void> =>
    runtimeData()
        .requestSyncCursorReset()
        .catch(error => logger.warn('SESSION', '[dataCommands] requestSyncCursorReset failed', { error }));

let stopStateObserver: (() => void) | undefined;

/**
 * Hands every settled state write to `observer`, or stops with `undefined` — one observer at a time,
 * a newer one replacing the last.
 */
export const setStateOutboxObserver = (observer: ((sample: StateOutboxSample) => void) | undefined): void => {
    stopStateObserver?.();
    stopStateObserver = observer ? runtimeData().observeStateOutbox(observer) : undefined;
};

/** The local cache's counts, read and reset — for the debug overlay. Both answer asynchronously. */
export const getCacheMetricsSource = (): {
    read(): Promise<CacheMetricsSnapshot>;
    reset(): Promise<void>;
} => ({
    read: () => runtimeData().cacheMetrics(),
    reset: () => runtimeData().resetCacheMetrics(),
});

/**
 * The id the current session is recorded under in an invited cloud's acceptor list: the relay
 * session's uid (a signed-in account, or the device's guest, whose uid is also its `delegatorId`),
 * falling back to the `delegatorId`. Null while nobody is signed in.
 */
export const getAcceptorId = (): string | null => {
    const { relayUser, context } = readSession();
    const uid = relayUser?.uid ?? relayUser?.id;
    if (typeof uid === 'string' && uid) return uid;
    return context.identity.delegatorId ?? null;
};
