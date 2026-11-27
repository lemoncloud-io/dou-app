import type {
    CacheMetricsSnapshot,
    ChatSendPayload,
    DomainChat,
    GlobalCacheContext,
    GlobalCacheRef,
    GlobalCacheSearchResult,
} from '@chatic/data';

import { getCloudRepositories, holdCloud, sendChatInCloud, waitForCloudSocket } from './cloudChat';
import { clearLocalCaches } from './clearLocalCaches';
import type { ClearLocalCachesResult } from './clearLocalCaches';
import { recoverInvitedCloudIfMissing, syncInvitedCloudName } from './invitedCloudDurability';
import { setStateOutboxObserver } from './factories/outboxFactory';
import type { StateOutboxSample } from './factories/outboxFactory';
import { getCacheMetricsSource, getGlobalCacheSearchSource } from './factories/localFactory';
import { pageRepositoriesOf } from './pageRepositories';
import type { PageRepositories } from './pageRepositories';
import { syncPairedCloudName } from './pairedCloudName';
import { getDataManager, getRepositories } from './runtime';
import { requestSyncCursorReset } from './syncCursorWatermark';
import { userGateway } from '@chatic/transport';
import type { RegisterDeviceTokenBody } from '@lemoncloud/chatic-backend-api';
import type { RegisterDeviceResult } from '@lemoncloud/chatic-pushes-api';

const EMPTY_SEARCH: GlobalCacheSearchResult = { channels: [], sites: [], chats: [] };
const EMPTY_CONTEXT: GlobalCacheContext = { channelsByRef: {}, sitesByRef: {}, joinsByRef: {}, lastChatsByRef: {} };

export interface RuntimeData {
    repositories(): PageRepositories;
    cloudRepositories(cid: string): PageRepositories;

    sendChatInCloud(cid: string, payload: ChatSendPayload): Promise<DomainChat>;
    waitForCloudSocket(cid: string, timeoutMs?: number): Promise<boolean>;
    holdCloud(cid: string): () => void;

    recoverInvitedCloud(cloudId: string | undefined): Promise<void>;
    syncInvitedCloudName(cloudId: string | undefined): Promise<void>;
    syncPairedCloudName(cloudId: string | undefined): Promise<void>;

    clearLocalCaches(): Promise<ClearLocalCachesResult>;
    requestSyncCursorReset(): Promise<void>;

    observeStateOutbox(observer: (sample: StateOutboxSample) => void): () => void;
    cacheMetrics(): Promise<CacheMetricsSnapshot>;
    resetCacheMetrics(): Promise<void>;
    searchCache(keyword: string, options?: { cid?: string }): Promise<GlobalCacheSearchResult>;
    resolveCacheContext(refs: { cids: string[]; channelRefs: GlobalCacheRef[] }): Promise<GlobalCacheContext>;
    registerDeviceToken(body: RegisterDeviceTokenBody, options?: { force?: boolean }): Promise<RegisterDeviceResult>;
}

export const createCoreRuntimeData = (): RuntimeData => {
    let stateObserver: ((sample: StateOutboxSample) => void) | undefined;
    const signedInUid = (): string | null => getDataManager().getContext().uid || null;

    return {
        repositories: () => pageRepositoriesOf(getRepositories()),
        cloudRepositories: cid => pageRepositoriesOf(getCloudRepositories(cid)),

        sendChatInCloud: (cid, payload) => sendChatInCloud(cid, payload),
        waitForCloudSocket: (cid, timeoutMs) => waitForCloudSocket(cid, timeoutMs ?? undefined),
        holdCloud: cid => holdCloud(cid),

        recoverInvitedCloud: cloudId => recoverInvitedCloudIfMissing(getRepositories().cloud, cloudId ?? undefined),
        syncInvitedCloudName: cloudId => syncInvitedCloudName(getRepositories().cloud, cloudId ?? undefined),
        syncPairedCloudName: cloudId => syncPairedCloudName(getRepositories().cloud, cloudId ?? undefined),

        clearLocalCaches: () => clearLocalCaches(),
        requestSyncCursorReset: async () => requestSyncCursorReset(),

        observeStateOutbox: observer => {
            stateObserver = observer;
            setStateOutboxObserver(observer);
            return () => {
                if (stateObserver !== observer) return;
                stateObserver = undefined;
                setStateOutboxObserver(undefined);
            };
        },
        cacheMetrics: async () => getCacheMetricsSource().read(),
        resetCacheMetrics: async () => getCacheMetricsSource().reset(),
        searchCache: async (keyword, options) => {
            const uid = signedInUid();
            if (!uid) return EMPTY_SEARCH;
            return getGlobalCacheSearchSource().search(keyword, { uid, cid: options?.cid });
        },
        resolveCacheContext: async refs => {
            const uid = signedInUid();
            if (!uid) return EMPTY_CONTEXT;
            return getGlobalCacheSearchSource().resolveContext({ uid, ...refs });
        },
        registerDeviceToken: (body, options) => userGateway().registerDevice(body, { force: options?.force }),
    };
};
