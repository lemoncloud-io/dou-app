import type {
    CacheMetricsSnapshot,
    ChatSendPayload,
    DomainChat,
    GlobalCacheContext,
    GlobalCacheRef,
    GlobalCacheSearchResult,
} from '@chatic/data';
import { logger } from '@chatic/logger';
import type { ClearLocalCachesResult, PageRepositories, RuntimeData, StateOutboxSample } from '@chatic/runtime-core';

import { runtimeEngine } from '../init';
import { readSession } from '../session/sessionReads';

export const runtimeData = (): RuntimeData => runtimeEngine().data;

export const getCloudRepositories = (cid: string): PageRepositories => runtimeData().cloudRepositories(cid);

export const sendChatInCloud = (cid: string, payload: ChatSendPayload): Promise<DomainChat> =>
    runtimeData().sendChatInCloud(cid, payload);

export const holdCloud = (cid: string): (() => void) => runtimeData().holdCloud(cid);

export const waitForCloudSocket = (cid: string, timeoutMs?: number): Promise<boolean> =>
    runtimeData().waitForCloudSocket(cid, timeoutMs);

export const recoverInvitedCloudIfMissing = (cloudId: string | undefined): Promise<void> =>
    runtimeData().recoverInvitedCloud(cloudId);

export const syncInvitedCloudName = (cloudId: string | undefined): Promise<void> =>
    runtimeData().syncInvitedCloudName(cloudId);

export const syncPairedCloudName = (cloudId: string | undefined): Promise<void> =>
    runtimeData().syncPairedCloudName(cloudId);

export const searchCache = (keyword: string, options?: { cid?: string }): Promise<GlobalCacheSearchResult> =>
    runtimeData().searchCache(keyword, options);

export const resolveCacheContext = (refs: {
    cids: string[];
    channelRefs: GlobalCacheRef[];
}): Promise<GlobalCacheContext> => runtimeData().resolveCacheContext(refs);

export const clearLocalCaches = (): Promise<ClearLocalCachesResult> => runtimeData().clearLocalCaches();

export const requestSyncCursorReset = (): Promise<void> =>
    runtimeData()
        .requestSyncCursorReset()
        .catch(error => logger.warn('SESSION', '[dataCommands] requestSyncCursorReset failed', { error }));

let stopStateObserver: (() => void) | undefined;

export const setStateOutboxObserver = (observer: ((sample: StateOutboxSample) => void) | undefined): void => {
    stopStateObserver?.();
    stopStateObserver = observer ? runtimeData().observeStateOutbox(observer) : undefined;
};

export const getCacheMetricsSource = (): {
    read(): Promise<CacheMetricsSnapshot>;
    reset(): Promise<void>;
} => ({
    read: () => runtimeData().cacheMetrics(),
    reset: () => runtimeData().resetCacheMetrics(),
});

export const getAcceptorId = (): string | null => {
    const { relayUser, context } = readSession();
    const uid = relayUser?.uid ?? relayUser?.id;
    if (typeof uid === 'string' && uid) return uid;
    return context.identity.delegatorId ?? null;
};
