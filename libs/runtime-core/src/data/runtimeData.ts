import type {
    CacheMetricsSnapshot,
    ChatSendPayload,
    DomainChat,
    GlobalCacheContext,
    GlobalCacheRef,
    GlobalCacheSearchResult,
} from '@chatic/data';

import { getCloudRepositories, sendChatInCloud, waitForCloudSocket } from './cloudChat';
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

const EMPTY_SEARCH: GlobalCacheSearchResult = { channels: [], sites: [], chats: [] };
const EMPTY_CONTEXT: GlobalCacheContext = { channelsByRef: {}, sitesByRef: {}, joinsByRef: {}, lastChatsByRef: {} };

/**
 * The data the screens read and write, as the engine hands it over — never the data manager or a
 * graph the page builds itself. On the phone the repositories and their cache may live in another
 * process; whatever crosses is plain data, a repository's `observe*` is a stream, and the token
 * issuers are not on the page's graph at all (`PageRepositories`).
 */
export interface RuntimeData {
    /** The repositories of the session's live scope — the selected cloud and place. The same object every time. */
    repositories(): PageRepositories;
    /** The repositories of one named cloud, whichever is selected — for work that belongs to that cloud. */
    cloudRepositories(cid: string): PageRepositories;

    /** Sends a chat to `cid`, holding that cloud's socket until the ack. */
    sendChatInCloud(cid: string, payload: ChatSendPayload): Promise<DomainChat>;
    /** Resolves `true` once `cid`'s socket is verified, `false` when `timeoutMs` passes first. */
    waitForCloudSocket(cid: string, timeoutMs?: number): Promise<boolean>;

    /** Rebuilds an invited cloud's cached row when a push names a cloud the cache lost. Best-effort. */
    recoverInvitedCloud(cloudId: string | undefined): Promise<void>;
    /** Reads an invited cloud's name from the relay and keeps it. Best-effort. */
    syncInvitedCloudName(cloudId: string | undefined): Promise<void>;
    /** Reads a paired cloud's name and keeps it with the paired cloud. Best-effort. */
    syncPairedCloudName(cloudId: string | undefined): Promise<void>;

    /** Empties every cloud's local cache partition for the signed-in account. */
    clearLocalCaches(): Promise<ClearLocalCachesResult>;
    /** Asks the next sync pass to start every target from the beginning. */
    requestSyncCursorReset(): Promise<void>;

    /** Hands every settled state write to `observer` until the returned function stops it. */
    observeStateOutbox(observer: (sample: StateOutboxSample) => void): () => void;
    /** The local cache's hit and miss counts so far. */
    cacheMetrics(): Promise<CacheMetricsSnapshot>;
    /** Starts the cache's counts over. */
    resetCacheMetrics(): Promise<void>;
    /** Searches every cloud's cached rooms and messages for the signed-in account — empty while signed out. */
    searchCache(keyword: string, options?: { cid?: string }): Promise<GlobalCacheSearchResult>;
    /** The clouds and rooms a set of search hits points at, for drawing them — empty while signed out. */
    resolveCacheContext(refs: { cids: string[]; channelRefs: GlobalCacheRef[] }): Promise<GlobalCacheContext>;
}

/** The core runtime's data: this process's repository graphs and cache. */
export const createCoreRuntimeData = (): RuntimeData => {
    let stateObserver: ((sample: StateOutboxSample) => void) | undefined;
    // Read at call time, so a sign-in or sign-out between two calls is reflected.
    const signedInUid = (): string | null => getDataManager().getContext().uid || null;

    return {
        repositories: () => pageRepositoriesOf(getRepositories()),
        cloudRepositories: cid => pageRepositoriesOf(getCloudRepositories(cid)),

        sendChatInCloud: (cid, payload) => sendChatInCloud(cid, payload),
        waitForCloudSocket: (cid, timeoutMs) => waitForCloudSocket(cid, timeoutMs ?? undefined),

        recoverInvitedCloud: cloudId => recoverInvitedCloudIfMissing(getRepositories().cloud, cloudId ?? undefined),
        syncInvitedCloudName: cloudId => syncInvitedCloudName(getRepositories().cloud, cloudId ?? undefined),
        syncPairedCloudName: cloudId => syncPairedCloudName(getRepositories().cloud, cloudId ?? undefined),

        clearLocalCaches: () => clearLocalCaches(),
        requestSyncCursorReset: async () => requestSyncCursorReset(),

        observeStateOutbox: observer => {
            stateObserver = observer;
            setStateOutboxObserver(observer);
            return () => {
                // A newer observer replaced this one: stopping the old one leaves the newer in place.
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
    };
};
