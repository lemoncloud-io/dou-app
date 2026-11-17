import type { PageAuthRepository, PagePairingRepository, PageRepositories } from '../data/pageRepositories';
import type { RuntimeData } from '../data/runtimeData';
import type { CheckedCrossing, PromiseCrossing } from './wire';

/**
 * How a repository method crosses, read off its signature so a table entry that disagrees with the
 * method does not compile:
 *
 * - `call` — the method returns a promise: one `RuntimeCall`, answered with what it resolves to;
 * - `receipt` — the method resolves with a write receipt (`{ delivered: Promise }`, `@chatic/data`'s
 *   outbox): the local half answers at once and the server's half settles later, which a promise in
 *   the result cannot carry. It crosses as a `RuntimeSubscribe` under the method's own name, whose
 *   events are `{ written }` once the local half is done and `{ delivered: true }` once the server has
 *   it; the method's failure, and a refused delivery, are the stream's `{ $ended: failure }`;
 * - `stream` — an `observe*` method, which returns its unsubscribe: a `RuntimeSubscribe` whose events
 *   are the callback's arguments, until the page unsubscribes;
 * - `send` — the method returns nothing: one `RuntimeCall` its caller does not wait for;
 * - `local` — the method answers synchronously with a value. That cannot cross: a page that mirrors
 *   another process's runtime has no answer to give in the same turn, so the method works only with the
 *   runtime in the page.
 *
 * A method whose promise resolves with anything else JSON cannot carry — a function, a promise, a `Map`
 * — has no crossing it can be listed with (`NotOnTheWire`): its entry fails to compile, with the part
 * that does not cross in the message.
 */
type RepositoryCrossing = 'call' | 'receipt' | 'stream' | 'send' | 'local';

type CrossingOf<Method> = Method extends (...args: never[]) => infer Result
    ? Result extends Promise<infer Value>
        ? PromiseCrossing<Value>
        : Result extends () => void
          ? 'stream'
          : [Result] extends [void]
            ? 'send'
            : 'local'
    : 'local';

/** The crossing every method of `Repository` must be listed with. */
type CrossingsOf<Repository> = { [Method in keyof Repository]: CrossingOf<Repository[Method]> };

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
    } satisfies CrossingsOf<PageAuthRepository>,
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
    } satisfies CrossingsOf<PageRepositories['channel']>,
    chat: {
        observeList: 'stream',
        observeLastList: 'stream',
        refreshList: 'call',
        observeFeedCoverage: 'stream',
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
        listRoomMedia: 'call',
        countRoomMedia: 'call',
    } satisfies CrossingsOf<PageRepositories['chat']>,
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
        fetchMiniAppUrl: 'call',
        saveMiniAppUrl: 'call',
    } satisfies CrossingsOf<PageRepositories['cloud']>,
    device: {
        syncDevice: 'send',
        syncStatus: 'send',
        updateRemotePushMute: 'call',
    } satisfies CrossingsOf<PageRepositories['device']>,
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
    } satisfies CrossingsOf<PageRepositories['invite']>,
    join: {
        observeList: 'stream',
        readChat: 'receipt',
        updateJoin: 'receipt',
        sendRead: 'call',
        sendJoinUpdate: 'call',
        writeMyJoinLocally: 'call',
        cacheReadList: 'call',
        cacheWrite: 'call',
        cacheDelete: 'call',
        cacheClear: 'call',
    } satisfies CrossingsOf<PageRepositories['join']>,
    pairing: {
        requestPairing: 'call',
        checkPairing: 'call',
        approvePairing: 'call',
        denyPairing: 'call',
        listPairings: 'call',
        revokePairing: 'call',
    } satisfies CrossingsOf<PagePairingRepository>,
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
    } satisfies CrossingsOf<PageRepositories['profile']>,
    report: {
        submitIssue: 'call',
        uploadLogBatch: 'call',
    } satisfies CrossingsOf<PageRepositories['report']>,
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
    } satisfies CrossingsOf<PageRepositories['place']>,
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
    } satisfies CrossingsOf<PageRepositories['subscription']>,
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
    } satisfies CrossingsOf<PageRepositories['user']>,
    syncMeta: {
        getSyncedAt: 'call',
        setSyncedAt: 'call',
        cacheClear: 'call',
    } satisfies CrossingsOf<PageRepositories['syncMeta']>,
} as const;

const repositoryMethodsCrossing = (...crossings: RepositoryCrossing[]): readonly string[] =>
    Object.entries(REPOSITORY_METHODS).flatMap(([repository, methods]) =>
        Object.entries(methods as Record<string, RepositoryCrossing>)
            .filter(([, crossing]) => crossings.includes(crossing))
            .map(([method]) => `${repository}.${method}`)
    );

/**
 * The repository methods a `RuntimeCall` may name — `call` and `send` alike — as `<repository>.<method>`.
 * The `receipt` methods are here too, for a page from before they crossed as a stream: the write is
 * made and the page gets what it always got — the receipt with its delivery emptied by JSON — rather
 * than a refusal that would leave the write unmade.
 */
export const REPOSITORY_CALL_METHODS: readonly string[] = repositoryMethodsCrossing('call', 'send', 'receipt');

/** The repository methods a `RuntimeSubscribe` may name — every `observe*` — as `<repository>.<method>`. */
export const REPOSITORY_STREAMS: readonly string[] = repositoryMethodsCrossing('stream');

/**
 * The repository methods that answer with a write receipt, as `<repository>.<method>`: a page subscribes
 * to one under the method's name to call it (see `RepositoryCrossing`).
 */
export const REPOSITORY_RECEIPTS: readonly string[] = repositoryMethodsCrossing('receipt');

/** The `target` a `RuntimeCall` or `RuntimeSubscribe` names for the data: the repositories and the rest of `RuntimeData`. */
export const DATA_TARGET = 'data';

/**
 * The `target` for a repository method of one cloud's graph (`RuntimeData.cloudRepositories`) rather
 * than the live scope's: the same `<repository>.<method>` names, with the cloud id as the first argument.
 */
export const DATA_CLOUD_TARGET = 'data@cloud';

type DataCrossing = 'view' | 'call' | 'stream' | 'local';

// Keyed by every member, so one added to `RuntimeData` and left out here does not compile.
// Each `call` entry is checked against its member's result as well, so one that would not cross as
// JSON does not compile (`CheckedCrossing`).
const dataMembers: { [Member in keyof RuntimeData]: CheckedCrossing<RuntimeData[Member], DataCrossing> } = {
    // The graphs themselves are the page's handles: their methods cross, one by one, as above.
    repositories: 'local',
    cloudRepositories: 'local',
    sendChatInCloud: 'call',
    waitForCloudSocket: 'call',
    // Stands while subscribed, with no listener and no events, like the sync's `registerTarget`: a
    // page's hold ends with its subscription, so a page that goes away mid-send leaves none behind.
    holdCloud: 'stream',
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
    registerDeviceToken: 'call',
};

/** The data methods a `RuntimeCall` may name, besides the repositories'. */
export const DATA_CALL_METHODS = (Object.keys(dataMembers) as (keyof RuntimeData)[]).filter(
    member => dataMembers[member] === 'call'
);
/** The data streams a `RuntimeSubscribe` may name, besides the repositories' `observe*`. */
export const DATA_STREAMS = (Object.keys(dataMembers) as (keyof RuntimeData)[]).filter(
    member => dataMembers[member] === 'stream'
);
