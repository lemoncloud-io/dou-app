import type {
    SubWebViewRuntimePermission,
    SubWebViewRuntimeRefusalReason,
    RuntimeWireValue,
} from '@chatic/bridge-messages';

import type { RuntimeData } from '../data/runtimeData';
import { CONNECTION_TARGET, SESSION_COMMANDS_TARGET, SYNC_TARGET } from './contract';
import { DATA_CLOUD_TARGET, DATA_TARGET, REPOSITORY_METHODS } from './repositories';

/**
 * Which of the runtime's requests a sub WebView page may send. A request whitelist, not a data filter:
 * an allowed method answers the page exactly what it answers the main web.
 *
 * Two rules decide every entry:
 * - **Read only, in what it does.** Nothing that writes on the server or in the device cache — a read
 *   that refreshes the cache with what it fetched included, since the page's arguments would decide
 *   where the rows land — and nothing that moves a sync cursor or a read cursor. One write is the
 *   exception, under a permission of its own (`chatSend`): `chat.sendChat` of a plain text message to
 *   a room of the place the page's view opened on, which the user's own composer could have sent.
 * - **The current cloud, and no switching.** Only the `data` target (the live scope) is open — the
 *   switches are session commands, and nothing that reaches another cloud is allowed.
 *
 * The tables below are keyed by every repository and method the runtime contract names, so a method
 * added to the runtime does not compile until it is decided here.
 */

/** Why a method or target is closed to a page. */
export type SubWebViewDenyReason = Exclude<SubWebViewRuntimeRefusalReason, 'notGranted' | 'guard' | 'unknown'>;

/**
 * What a request spends: `local` reads the device cache or one of its streams; `server` asks the server
 * and writes nothing; `send` posts a message, which the shell budgets apart from the reads.
 */
export type SubWebViewRequestCost = 'local' | 'server' | 'send';

/** The longest message a page may send, in UTF-16 code units. */
export const SUB_WEB_VIEW_MESSAGE_LIMIT = 1000;

/**
 * An argument check. Arguments pass through as the main web would send them, except where an entry
 * pins one: `currentCloud` / `currentPlace` — the argument, or its `field`, must name the session's
 * current cloud or committed place; `absent` — the argument's `field` must not be there; `false` — the
 * argument's `field` must be there and be `false`, an option the page has to turn off itself;
 * `onlyFields` — the argument must be a plain object with no field but these; `text` — the argument's
 * `field` must be a string with something besides white space in it, at most `maxLength` long;
 * `argCount` — the request carries at most `max` arguments, so a parameter the method gains later is
 * not open until it is decided here.
 */
export type SubWebViewArgGuard =
    | { arg: number; field?: string; is: 'currentCloud' | 'currentPlace' }
    | { arg: number; field: string; is: 'absent' }
    | { arg: number; field: string; is: 'false' }
    | { arg: number; is: 'onlyFields'; fields: readonly string[] }
    | { arg: number; field: string; is: 'text'; maxLength: number }
    | { is: 'argCount'; max: number };

export interface SubWebViewAllow {
    allow: SubWebViewRuntimePermission;
    cost: SubWebViewRequestCost;
    guards?: readonly SubWebViewArgGuard[];
    /**
     * The argument's `field` names a room that must be one of the place the page is held to — the one
     * its view opened on. A room is known only from the device cache, and the view only to the shell,
     * neither of which this pure check reads: the shell reads the room before it lets the request go,
     * and refuses it as a `guard` when the room is not there.
     */
    roomInCurrentPlace?: { arg: number; field: string };
}

/** Where the session is, as the argument checks read it. */
export interface SubWebViewRuntimeScope {
    cloudId: string | null;
    /** The place the session is really on (`committedSiteId`), not a selection still switching. */
    placeId: string | null;
}

export interface SubWebViewDeny {
    deny: SubWebViewDenyReason;
}

export type SubWebViewDecision = SubWebViewAllow | SubWebViewDeny;

type RepositoryName = keyof typeof REPOSITORY_METHODS;
type MethodsOf<R extends RepositoryName> = keyof (typeof REPOSITORY_METHODS)[R] & string;

/** A repository is decided method by method, or closed whole with one reason. */
type RepositoryDecision<R extends RepositoryName> =
    | { closed: SubWebViewDenyReason }
    | { methods: { [M in MethodsOf<R>]: SubWebViewDecision } };

const local = (allow: SubWebViewRuntimePermission) => ({ allow, cost: 'local' }) as const;
const server = (allow: SubWebViewRuntimePermission) => ({ allow, cost: 'server' }) as const;
const deny = (reason: SubWebViewDenyReason) => ({ deny: reason }) as const;

export const SUB_WEB_VIEW_REPOSITORY_WHITELIST = {
    channel: {
        methods: {
            observeList: local('channel'),
            observeItem: local('channel'),
            cacheRead: local('channel'),
            cacheReadList: local('channel'),
            // Answers the server's list and leaves the cache alone.
            fetchList: server('channel'),
            // Each writes what it fetched, tagged with the place the caller names.
            refreshList: deny('cacheWrite'),
            refreshOne: deny('cacheWrite'),
            syncChannels: deny('cursor'),
            createChannel: deny('write'),
            startDm: deny('write'),
            updateChannel: deny('write'),
            inviteChannel: deny('write'),
            leaveChannel: deny('write'),
            deleteChannel: deny('write'),
            // `channel.get-self` creates the self chat when there is none.
            getSelfChannel: deny('serverSideEffect'),
            refreshOneInCloud: deny('otherCloud'),
            evictLeftChannels: deny('cacheWrite'),
            dropMemberFromChannels: deny('cacheWrite'),
            cacheWrite: deny('cacheWrite'),
            cacheDelete: deny('cacheWrite'),
            cacheClear: deny('cacheWrite'),
        },
    },
    join: {
        methods: {
            observeList: local('channel'),
            cacheReadList: local('channel'),
            readChat: deny('cursor'),
            sendRead: deny('cursor'),
            updateJoin: deny('write'),
            sendJoinUpdate: deny('write'),
            writeMyJoinLocally: deny('cacheWrite'),
            cacheWrite: deny('cacheWrite'),
            cacheDelete: deny('cacheWrite'),
            cacheClear: deny('cacheWrite'),
        },
    },
    chat: {
        methods: {
            observeList: local('chat'),
            observeLastList: local('chat'),
            observeFeedCoverage: local('chat'),
            cacheRead: local('chat'),
            cacheReadList: local('chat'),
            listPendingImageChats: local('chat'),
            // The first read of a room fills its media index from the cached rows.
            listRoomMedia: deny('cacheWrite'),
            countRoomMedia: deny('cacheWrite'),
            // Writes the message it fetched.
            getChat: deny('cacheWrite'),
            // Writes the page it fetched, and can mark cached rows hidden on the caller's options.
            refreshList: deny('cacheWrite'),
            // A plain text message to a room of the view's place, in the user's name: the one write a
            // page may ask for. Nothing else a message can carry — attachments, a mention, a reply, a
            // system or webhook row — gets past the field list.
            sendChat: {
                allow: 'chatSend',
                cost: 'send',
                guards: [
                    { is: 'argCount', max: 1 },
                    { arg: 0, is: 'onlyFields', fields: ['channelId', 'content'] },
                    { arg: 0, field: 'channelId', is: 'text', maxLength: 200 },
                    { arg: 0, field: 'content', is: 'text', maxLength: SUB_WEB_VIEW_MESSAGE_LIMIT },
                ],
                roomInCurrentPlace: { arg: 0, field: 'channelId' },
            },
            updateChat: deny('write'),
            deleteChat: deny('write'),
            setReaction: deny('write'),
            startUploads: deny('write'),
            completeUploads: deny('write'),
            sendPendingImageChat: deny('write'),
            createPendingImageChat: deny('cacheWrite'),
            failPendingImageChat: deny('cacheWrite'),
            cacheWrite: deny('cacheWrite'),
            cacheWriteMany: deny('cacheWrite'),
            cacheDelete: deny('cacheWrite'),
            cacheClear: deny('cacheWrite'),
            cacheClearByChannelId: deny('cacheWrite'),
        },
    },
    cloud: {
        methods: {
            // The cloud repository is the account's, across its clouds: each read that names one is
            // held to the current cloud's id.
            observeItem: { allow: 'cloud', cost: 'local', guards: [{ arg: 0, is: 'currentCloud' }] },
            cacheRead: { allow: 'cloud', cost: 'local', guards: [{ arg: 0, is: 'currentCloud' }] },
            // The server's view of the current cloud — its name and owner, which an owned cloud's cache
            // row does not hold — and only with `{ cache: false }`, which writes nothing: by default the
            // read files what it fetched into the cache.
            getCloud: {
                allow: 'cloud',
                cost: 'server',
                guards: [
                    { arg: 0, field: 'id', is: 'currentCloud' },
                    { arg: 0, field: 'cid', is: 'absent' },
                    { arg: 1, field: 'cache', is: 'false' },
                ],
            },
            observeList: deny('otherCloud'),
            cacheReadList: deny('otherCloud'),
            fetchCloudCatalog: deny('otherCloud'),
            updateCloud: deny('write'),
            makeCloud: deny('write'),
            releaseCloud: deny('write'),
            retryCloudSetup: deny('write'),
            verifyCloudEmail: deny('account'),
            cacheWrite: deny('cacheWrite'),
            cacheDelete: deny('cacheWrite'),
            cacheClear: deny('cacheWrite'),
        },
    },
    place: {
        methods: {
            observeList: local('place'),
            observeItem: local('place'),
            cacheReadList: local('place'),
            // Writes the list it fetched.
            refreshList: deny('cacheWrite'),
            isPlaceDeleted: server('place'),
            createPlace: deny('write'),
            updatePlace: deny('write'),
            deletePlace: deny('write'),
            leavePlace: deny('write'),
            removeMember: deny('write'),
            cacheWrite: deny('cacheWrite'),
            cacheDelete: deny('cacheWrite'),
            cacheClear: deny('cacheWrite'),
        },
    },
    user: {
        methods: {
            observeList: local('user'),
            observeItem: local('user'),
            cacheRead: local('user'),
            cacheReadList: local('user'),
            // Loads the members' place profiles into the cache — so only for the place the session is
            // on, which is the place the server answers profiles for, and in the server's own page size
            // so one call stays a bounded number of requests.
            listPlaceMembers: {
                allow: 'user',
                cost: 'server',
                guards: [
                    { arg: 0, field: 'placeId', is: 'currentPlace' },
                    { arg: 0, field: 'sessionPlaceId', is: 'currentPlace' },
                    { arg: 0, field: 'pageSize', is: 'absent' },
                ],
            },
            // Each writes what it fetched (`getMyProfile` the place row embedded in the answer too).
            getMyProfile: deny('cacheWrite'),
            refreshList: deny('cacheWrite'),
            syncChannelUsers: deny('cacheWrite'),
            updateProfile: deny('write'),
            requestInvite: deny('write'),
            requestInviteBatch: deny('write'),
            unlinkDevice: deny('device'),
            listDevices: deny('device'),
            listRelayUsers: deny('admin'),
            tryFetchProfile: deny('account'),
            cacheWrite: deny('cacheWrite'),
            cacheWriteMany: deny('cacheWrite'),
            cacheDelete: deny('cacheWrite'),
            cacheClear: deny('cacheWrite'),
        },
    },
    profile: {
        methods: {
            observeList: local('user'),
            observeItem: local('user'),
            cacheRead: local('user'),
            cacheReadList: local('user'),
            // Each writes what it fetched, tagged with the place the caller names.
            refreshItem: deny('cacheWrite'),
            syncProfilesOf: deny('cacheWrite'),
            // `profile.get-mine` creates the row when there is none.
            getMyProfile: deny('serverSideEffect'),
            syncProfiles: deny('cursor'),
            setMyProfile: deny('write'),
            cacheWrite: deny('cacheWrite'),
            cacheDelete: deny('cacheWrite'),
            cacheClear: deny('cacheWrite'),
        },
    },
    auth: { closed: 'account' },
    pairing: { closed: 'account' },
    invite: { closed: 'account' },
    subscription: { closed: 'account' },
    device: { closed: 'device' },
    report: { closed: 'device' },
    syncMeta: { closed: 'cursor' },
} as const satisfies { [R in RepositoryName]: RepositoryDecision<R> };

/** The rest of the `data` target, beside the repositories. All closed. */
export const SUB_WEB_VIEW_DATA_MEMBER_WHITELIST = {
    repositories: deny('internal'),
    cloudRepositories: deny('otherCloud'),
    sendChatInCloud: deny('write'),
    recoverInvitedCloud: deny('write'),
    syncInvitedCloudName: deny('write'),
    syncPairedCloudName: deny('write'),
    clearLocalCaches: deny('cacheWrite'),
    resetCacheMetrics: deny('cacheWrite'),
    requestSyncCursorReset: deny('cursor'),
    // Both take cloud ids of their own.
    searchCache: deny('otherCloud'),
    resolveCacheContext: deny('otherCloud'),
    registerDeviceToken: deny('device'),
    waitForCloudSocket: deny('internal'),
    holdCloud: deny('internal'),
    observeStateOutbox: deny('internal'),
    cacheMetrics: deny('internal'),
} as const satisfies { [M in keyof RuntimeData]: SubWebViewDeny };

/**
 * The targets. Only `data` is open. The session reaches a page through the hello and its pushes, never
 * as a call: the `session` target is where the cloud and place switches are.
 */
export const SUB_WEB_VIEW_TARGETS = {
    [DATA_TARGET]: 'open',
    [DATA_CLOUD_TARGET]: deny('otherCloud'),
    [SESSION_COMMANDS_TARGET]: deny('account'),
    [CONNECTION_TARGET]: deny('internal'),
    [SYNC_TARGET]: deny('internal'),
} as const satisfies Record<string, 'open' | SubWebViewDeny>;

/** One allowed method, with how it crosses. */
export interface SubWebViewWhitelistEntry extends SubWebViewAllow {
    /** `<repository>.<method>`. */
    method: string;
    crossing: 'call' | 'stream';
}

const isAllow = (decision: SubWebViewDecision): decision is SubWebViewAllow => 'allow' in decision;

/** Every allowed method, keyed by `<repository>.<method>`. */
export const SUB_WEB_VIEW_ALLOWED: ReadonlyMap<string, SubWebViewWhitelistEntry> = new Map(
    (Object.entries(SUB_WEB_VIEW_REPOSITORY_WHITELIST) as [RepositoryName, { methods?: object }][]).flatMap(
        ([repository, decision]) =>
            Object.entries((decision.methods ?? {}) as Record<string, SubWebViewDecision>)
                .filter((entry): entry is [string, SubWebViewAllow] => isAllow(entry[1]))
                .map(([method, allow]): [string, SubWebViewWhitelistEntry] => {
                    const name = `${repository}.${method}`;
                    const crossing = (REPOSITORY_METHODS[repository] as Record<string, string>)[method];
                    return [name, { ...allow, method: name, crossing: crossing === 'stream' ? 'stream' : 'call' }];
                })
    )
);

/** The calls and streams a set of granted permissions opens, each list sorted. */
export const subWebViewAllowedFor = (
    granted: ReadonlySet<SubWebViewRuntimePermission>
): { calls: string[]; streams: string[] } => {
    const calls: string[] = [];
    const streams: string[] = [];
    SUB_WEB_VIEW_ALLOWED.forEach(entry => {
        if (granted.has(entry.allow)) (entry.crossing === 'stream' ? streams : calls).push(entry.method);
    });
    return { calls: calls.sort(), streams: streams.sort() };
};

/** `table[key]` only for the table's own keys: a page names them, and `__proto__` must name nothing. */
const own = <T>(table: object, key: string): T | undefined =>
    Object.prototype.hasOwnProperty.call(table, key) ? (table as Record<string, T>)[key] : undefined;

/** The reason a known method is closed, or `null` when it is not a closed one. */
const deniedReason = (method: string): SubWebViewDenyReason | null => {
    const dot = method.indexOf('.');
    if (dot < 0) return own<SubWebViewDeny>(SUB_WEB_VIEW_DATA_MEMBER_WHITELIST, method)?.deny ?? null;
    const decision = own<{ closed: SubWebViewDenyReason } | { methods: Record<string, SubWebViewDecision> }>(
        SUB_WEB_VIEW_REPOSITORY_WHITELIST,
        method.slice(0, dot)
    );
    if (!decision) return null;
    if ('closed' in decision) return decision.closed;
    const entry = own<SubWebViewDecision>(decision.methods, method.slice(dot + 1));
    return entry && !isAllow(entry) ? entry.deny : null;
};

const isRecord = (value: unknown): value is Record<string, RuntimeWireValue> =>
    value !== null && typeof value === 'object' && !Array.isArray(value);

/** Whether the arguments meet one guard. A field is read only off a plain object argument. */
const meets = (args: readonly RuntimeWireValue[], guard: SubWebViewArgGuard, scope: SubWebViewRuntimeScope) => {
    if (guard.is === 'argCount') return args.length <= guard.max;
    const argument = args[guard.arg];
    if (guard.is === 'absent') {
        return !isRecord(argument) || !Object.prototype.hasOwnProperty.call(argument, guard.field);
    }
    if (guard.is === 'false') {
        return isRecord(argument) && own<RuntimeWireValue>(argument, guard.field) === false;
    }
    if (guard.is === 'onlyFields') {
        return isRecord(argument) && Object.keys(argument).every(key => guard.fields.includes(key));
    }
    if (guard.is === 'text') {
        const value = isRecord(argument) ? own<RuntimeWireValue>(argument, guard.field) : undefined;
        return typeof value === 'string' && value.trim() !== '' && value.length <= guard.maxLength;
    }
    const value =
        guard.field === undefined
            ? argument
            : isRecord(argument)
              ? own<RuntimeWireValue>(argument, guard.field)
              : undefined;
    switch (guard.is) {
        case 'currentCloud':
            return scope.cloudId !== null && value === scope.cloudId;
        case 'currentPlace':
            return scope.placeId !== null && value === scope.placeId;
        default: {
            // A guard kind added to the type and not here fails to compile rather than passing as a place check.
            const unhandled: never = guard;
            return unhandled;
        }
    }
};

export interface SubWebViewRuntimeRequest {
    /** `call` for a `RuntimeCall`, `stream` for a `RuntimeSubscribe`. */
    kind: 'call' | 'stream';
    target: string;
    method: string;
    args: readonly RuntimeWireValue[];
}

export type SubWebViewRuntimeCheck =
    | { ok: true; entry: SubWebViewWhitelistEntry }
    | { ok: false; reason: SubWebViewRuntimeRefusalReason };

/**
 * Whether a page may send this request, from the whitelist alone: the target, then the method and the
 * way it is asked, then the permission, then the entry's argument guards. Pure — the view's cloud,
 * consent and the read budget are the shell's to check around it.
 */
export const checkSubWebViewRuntimeRequest = (
    request: SubWebViewRuntimeRequest,
    granted: ReadonlySet<SubWebViewRuntimePermission>,
    scope: SubWebViewRuntimeScope
): SubWebViewRuntimeCheck => {
    const target = own<'open' | SubWebViewDeny>(SUB_WEB_VIEW_TARGETS, request.target);
    if (target === undefined) return { ok: false, reason: 'unknown' };
    if (target !== 'open') return { ok: false, reason: target.deny };

    const entry = SUB_WEB_VIEW_ALLOWED.get(request.method);
    if (!entry) return { ok: false, reason: deniedReason(request.method) ?? 'unknown' };
    // A call named as a stream, or the reverse, is not the request the whitelist allowed.
    if (entry.crossing !== request.kind) return { ok: false, reason: 'unknown' };
    if (!granted.has(entry.allow)) return { ok: false, reason: 'notGranted' };
    if (entry.guards && !entry.guards.every(guard => meets(request.args, guard, scope))) {
        return { ok: false, reason: 'guard' };
    }
    return { ok: true, entry };
};
