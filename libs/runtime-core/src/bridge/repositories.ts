import type { PageAuthRepository, PagePairingRepository, PageRepositories } from '../data/pageRepositories';
import type { RuntimeData } from '../data/runtimeData';

/**
 * How a repository method crosses: `call` is one `RuntimeCall` whose result is the method's own;
 * `stream` is an `observe*` method — a `RuntimeSubscribe` whose events are the callback's
 * arguments, until the page unsubscribes.
 */
type RepositoryCrossing = 'call' | 'stream';

/**
 * Every method of the page's repository graph, by repository, and how it crosses. Keyed by every
 * method of each repository's page type, so a method added to a repository and left out here does not
 * compile. The token issuers are not on the page's graph, so they are not here either.
 *
 * A `RuntimeCall` names a repository method with the target `data` (`DATA_TARGET`) and the method as
 * `<repository>.<method>` — `chat.sendChat` — and, for a cloud's graph rather than the live scope's,
 * the cloud id first among its arguments (`cloudRepositories`).
 */
export const REPOSITORY_METHODS = {
    auth: {
        sendPhoneCode: 'call',
        verifyPhoneCode: 'call',
        confirmPhoneCode: 'call',
        verifySocialAccount: 'call',
        confirmSocialAccount: 'call',
        registerUser: 'call',
        registerUserV2: 'call',
        findAlias: 'call',
        verifyAlias: 'call',
        fetchInviteInfo: 'call',
    } satisfies Record<keyof PageAuthRepository, RepositoryCrossing>,
    channel: {
        observeList: 'stream',
        observeItem: 'stream',
        refreshList: 'call',
        fetchList: 'call',
        syncChannels: 'call',
        createChannel: 'call',
        startDm: 'call',
        updateChannel: 'call',
        inviteChannel: 'call',
        leaveChannel: 'call',
        deleteChannel: 'call',
        evictLeftChannels: 'call',
        dropMemberFromChannels: 'call',
        getSelfChannel: 'call',
        refreshOne: 'call',
        refreshOneInCloud: 'call',
        cacheRead: 'call',
        cacheReadList: 'call',
        cacheWrite: 'call',
        cacheDelete: 'call',
        cacheClear: 'call',
    } satisfies Record<keyof PageRepositories['channel'], RepositoryCrossing>,
    chat: {
        observeList: 'stream',
        observeLastList: 'stream',
        refreshList: 'call',
        uncoveredFeed: 'call',
        getChat: 'call',
        sendChat: 'call',
        updateChat: 'call',
        deleteChat: 'call',
        setReaction: 'call',
        startUploads: 'call',
        completeUploads: 'call',
        createPendingImageChat: 'call',
        sendPendingImageChat: 'call',
        failPendingImageChat: 'call',
        listPendingImageChats: 'call',
        cacheRead: 'call',
        cacheReadList: 'call',
        cacheWrite: 'call',
        cacheWriteMany: 'call',
        cacheDelete: 'call',
        cacheClear: 'call',
        cacheClearByChannelId: 'call',
    } satisfies Record<keyof PageRepositories['chat'], RepositoryCrossing>,
    cloud: {
        observeList: 'stream',
        observeItem: 'stream',
        getCloud: 'call',
        updateCloud: 'call',
        cacheRead: 'call',
        cacheReadList: 'call',
        cacheWrite: 'call',
        cacheDelete: 'call',
        cacheClear: 'call',
        fetchCloudCatalog: 'call',
        verifyCloudEmail: 'call',
        makeCloud: 'call',
        releaseCloud: 'call',
        retryCloudSetup: 'call',
    } satisfies Record<keyof PageRepositories['cloud'], RepositoryCrossing>,
    device: {
        syncDevice: 'call',
        syncStatus: 'call',
        updateRemotePushMute: 'call',
    } satisfies Record<keyof PageRepositories['device'], RepositoryCrossing>,
    invite: {
        list: 'call',
        create: 'call',
        get: 'call',
        accept: 'call',
        cancel: 'call',
        reject: 'call',
        cacheReadList: 'call',
        observeList: 'stream',
        dismiss: 'call',
        cacheWrite: 'call',
        cacheDelete: 'call',
        cacheClear: 'call',
    } satisfies Record<keyof PageRepositories['invite'], RepositoryCrossing>,
    join: {
        observeList: 'stream',
        readChat: 'call',
        updateJoin: 'call',
        sendRead: 'call',
        sendJoinUpdate: 'call',
        writeMyJoinLocally: 'call',
        cacheReadList: 'call',
        cacheWrite: 'call',
        cacheDelete: 'call',
        cacheClear: 'call',
    } satisfies Record<keyof PageRepositories['join'], RepositoryCrossing>,
    pairing: {
        requestPairing: 'call',
        checkPairing: 'call',
        approvePairing: 'call',
        denyPairing: 'call',
        listPairings: 'call',
        revokePairing: 'call',
    } satisfies Record<keyof PagePairingRepository, RepositoryCrossing>,
    profile: {
        observeList: 'stream',
        observeItem: 'stream',
        refreshItem: 'call',
        getMyProfile: 'call',
        setMyProfile: 'call',
        syncProfiles: 'call',
        syncProfilesOf: 'call',
        cacheRead: 'call',
        cacheReadList: 'call',
        cacheWrite: 'call',
        cacheDelete: 'call',
        cacheClear: 'call',
    } satisfies Record<keyof PageRepositories['profile'], RepositoryCrossing>,
    report: {
        submitIssue: 'call',
        uploadLogBatch: 'call',
    } satisfies Record<keyof PageRepositories['report'], RepositoryCrossing>,
    place: {
        observeList: 'stream',
        observeItem: 'stream',
        refreshList: 'call',
        createPlace: 'call',
        updatePlace: 'call',
        deletePlace: 'call',
        leavePlace: 'call',
        removeMember: 'call',
        isPlaceDeleted: 'call',
        cacheReadList: 'call',
        cacheWrite: 'call',
        cacheDelete: 'call',
        cacheClear: 'call',
    } satisfies Record<keyof PageRepositories['place'], RepositoryCrossing>,
    subscription: {
        fetchPlans: 'call',
        fetchMembershipInfo: 'call',
        validateMembership: 'call',
        markDrops: 'call',
        fetchAdminMemberships: 'call',
        updateMembershipByAdmin: 'call',
        refundSubscriptionByAdmin: 'call',
        fetchAdminClouds: 'call',
        fetchSubscriptionCards: 'call',
        issueBillingKey: 'call',
        startSubscription: 'call',
        changeSubscription: 'call',
        cancelSubscription: 'call',
        addCard: 'call',
        setDefaultCard: 'call',
        removeCard: 'call',
    } satisfies Record<keyof PageRepositories['subscription'], RepositoryCrossing>,
    user: {
        observeList: 'stream',
        observeItem: 'stream',
        getMyProfile: 'call',
        updateProfile: 'call',
        requestInvite: 'call',
        requestInviteBatch: 'call',
        syncChannelUsers: 'call',
        refreshList: 'call',
        listPlaceMembers: 'call',
        listDevices: 'call',
        unlinkDevice: 'call',
        cacheRead: 'call',
        cacheReadList: 'call',
        cacheWrite: 'call',
        cacheWriteMany: 'call',
        cacheDelete: 'call',
        cacheClear: 'call',
        listRelayUsers: 'call',
        tryFetchProfile: 'call',
    } satisfies Record<keyof PageRepositories['user'], RepositoryCrossing>,
    syncMeta: {
        getSyncedAt: 'call',
        setSyncedAt: 'call',
        cacheClear: 'call',
    } satisfies Record<keyof PageRepositories['syncMeta'], RepositoryCrossing>,
} as const;

/** The repository methods a `RuntimeCall` may name, as `<repository>.<method>`. */
export const REPOSITORY_CALL_METHODS: readonly string[] = Object.entries(REPOSITORY_METHODS).flatMap(
    ([repository, methods]) =>
        Object.entries(methods)
            .filter(([, crossing]) => crossing === 'call')
            .map(([method]) => `${repository}.${method}`)
);

/** The repository methods a `RuntimeSubscribe` may name — every `observe*` — as `<repository>.<method>`. */
export const REPOSITORY_STREAMS: readonly string[] = Object.entries(REPOSITORY_METHODS).flatMap(
    ([repository, methods]) =>
        Object.entries(methods)
            .filter(([, crossing]) => crossing === 'stream')
            .map(([method]) => `${repository}.${method}`)
);

/** The `target` a `RuntimeCall` or `RuntimeSubscribe` names for the data: the repositories and the rest of `RuntimeData`. */
export const DATA_TARGET = 'data';

type DataCrossing = 'view' | 'call' | 'stream' | 'local';

// Keyed by every member, so one added to `RuntimeData` and left out here does not compile.
const dataMembers: Record<keyof RuntimeData, DataCrossing> = {
    // The graphs themselves are the page's handles: their methods cross, one by one, as above.
    repositories: 'local',
    cloudRepositories: 'local',
    sendChatInCloud: 'call',
    waitForCloudSocket: 'call',
    recoverInvitedCloud: 'call',
    syncInvitedCloudName: 'call',
    syncPairedCloudName: 'call',
    clearLocalCaches: 'call',
    requestSyncCursorReset: 'call',
    observeStateOutbox: 'stream',
    cacheMetrics: 'call',
    resetCacheMetrics: 'call',
    searchCache: 'call',
    resolveCacheContext: 'call',
};

/** The data methods a `RuntimeCall` may name, besides the repositories'. */
export const DATA_CALL_METHODS = (Object.keys(dataMembers) as (keyof RuntimeData)[]).filter(
    member => dataMembers[member] === 'call'
);
/** The data streams a `RuntimeSubscribe` may name, besides the repositories' `observe*`. */
export const DATA_STREAMS = (Object.keys(dataMembers) as (keyof RuntimeData)[]).filter(
    member => dataMembers[member] === 'stream'
);
