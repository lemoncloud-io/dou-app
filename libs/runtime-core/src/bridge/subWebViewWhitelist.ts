import type {
    SubWebViewRuntimePermission,
    SubWebViewRuntimeRefusalReason,
    RuntimeWireValue,
} from '@chatic/bridge-messages';

import type { RuntimeData } from '../data/runtimeData';
import { CONNECTION_TARGET, SESSION_COMMANDS_TARGET, SYNC_TARGET } from './contract';
import { DATA_CLOUD_TARGET, DATA_TARGET, REPOSITORY_METHODS } from './repositories';

export type SubWebViewDenyReason = Exclude<SubWebViewRuntimeRefusalReason, 'notGranted' | 'guard' | 'unknown'>;

export type SubWebViewRequestCost = 'local' | 'server' | 'send' | 'react';

export const SUB_WEB_VIEW_MESSAGE_LIMIT = 1000;

export const SUB_WEB_VIEW_REACTION_LIMIT = 16;

const isJoiner = (cp: number) => cp === 0x200d;
const isCombiningMark = (cp: number) =>
    (cp >= 0x0300 && cp <= 0x036f) || (cp >= 0x1ab0 && cp <= 0x1aff) || (cp >= 0x1dc0 && cp <= 0x1dff);
const isVariationSelector = (cp: number) => (cp >= 0xfe00 && cp <= 0xfe0f) || (cp >= 0xe0100 && cp <= 0xe01ef);
const isSkinTone = (cp: number) => cp >= 0x1f3fb && cp <= 0x1f3ff;
const isKeycap = (cp: number) => cp === 0x20e3;
const isTag = (cp: number) => cp >= 0xe0020 && cp <= 0xe007f;
const BLACK_FLAG = 0x1f3f4;
const isRegionalIndicator = (cp: number) => cp >= 0x1f1e6 && cp <= 0x1f1ff;
const isPictographic = (cp: number) =>
    cp === 0x00a9 ||
    cp === 0x00ae ||
    cp === 0x203c ||
    cp === 0x2049 ||
    cp === 0x2122 ||
    cp === 0x2139 ||
    (cp >= 0x2190 && cp <= 0x21ff) ||
    (cp >= 0x2300 && cp <= 0x23ff) ||
    cp === 0x24c2 ||
    (cp >= 0x25a0 && cp <= 0x27bf) ||
    (cp >= 0x2900 && cp <= 0x297f) ||
    (cp >= 0x2b00 && cp <= 0x2bff) ||
    cp === 0x3030 ||
    cp === 0x303d ||
    cp === 0x3297 ||
    cp === 0x3299 ||
    (cp >= 0x1f000 && cp <= 0x1faff && !isSkinTone(cp) && !isRegionalIndicator(cp));
const isKeycapBase = (cp: number) => cp === 0x23 || cp === 0x2a || (cp >= 0x30 && cp <= 0x39);
const isInvisible = (cp: number) =>
    cp <= 0x20 ||
    (cp >= 0x7f && cp <= 0xa0) ||
    cp === 0xad ||
    cp === 0x034f ||
    cp === 0x061c ||
    cp === 0x115f ||
    cp === 0x1160 ||
    cp === 0x180e ||
    (cp >= 0x2000 && cp <= 0x200f) ||
    (cp >= 0x2028 && cp <= 0x202f) ||
    (cp >= 0x205f && cp <= 0x206f) ||
    cp === 0x3000 ||
    cp === 0x3164 ||
    (cp >= 0xd800 && cp <= 0xdfff) ||
    (cp >= 0xe000 && cp <= 0xf8ff) ||
    cp === 0xfeff ||
    cp === 0xffa0 ||
    (cp >= 0xfff0 && cp <= 0xffff) ||
    cp >= 0xf0000;

const isEmojiSequence = (points: readonly number[]): boolean => {
    let i = 0;
    const element = (): boolean => {
        if (i >= points.length || !isPictographic(points[i])) return false;
        const base = points[i];
        i += 1;
        if (i < points.length && isVariationSelector(points[i])) i += 1;
        if (i < points.length && isSkinTone(points[i])) i += 1;
        if (base === BLACK_FLAG && i < points.length && isTag(points[i])) {
            while (i < points.length && isTag(points[i])) i += 1;
            return points[i - 1] === 0xe007f;
        }
        return true;
    };
    if (!element()) return false;
    while (i < points.length) {
        if (!isJoiner(points[i])) return false;
        i += 1;
        if (!element()) return false;
    }
    return true;
};

export const isOneReactionCharacter = (value: string): boolean => {
    if (value.length === 0 || value.length > SUB_WEB_VIEW_REACTION_LIMIT) return false;
    const points = Array.from(value, ch => ch.codePointAt(0) ?? 0);
    const first = points[0];
    if (isInvisible(first)) return false;
    if (isRegionalIndicator(first)) return points.length === 2 && isRegionalIndicator(points[1]);
    if (isKeycapBase(first) && points.length > 1) {
        return (
            (points.length === 2 && isKeycap(points[1])) ||
            (points.length === 3 && isVariationSelector(points[1]) && isKeycap(points[2]))
        );
    }
    if (isPictographic(first)) return isEmojiSequence(points);
    if (isCombiningMark(first) || isVariationSelector(first) || isSkinTone(first) || isJoiner(first)) return false;
    return points.length <= 3 && points.slice(1).every(isCombiningMark);
};

export type SubWebViewArgGuard =
    | { arg: number; field?: string; is: 'currentCloud' | 'currentPlace' }
    | { arg: number; field: string; is: 'absent' }
    | { arg: number; field: string; is: 'false' }
    | { arg: number; is: 'onlyFields'; fields: readonly string[] }
    | { arg: number; field: string; is: 'text'; maxLength: number }
    | { is: 'argCount'; max: number }
    | { arg: number; is: 'currentPlaceKey' }
    | { arg: number; field: string; is: 'oneOf'; values: readonly string[] }
    | { arg: number; field: string; is: 'reaction' };

export interface SubWebViewAllow {
    allow: SubWebViewRuntimePermission;
    cost: SubWebViewRequestCost;
    guards?: readonly SubWebViewArgGuard[];
    roomInCurrentPlace?: { arg: number; field?: string; each?: boolean };
    answerRoomInCurrentPlace?: { field: string };
    messageInCurrentPlace?: { arg: number; field: string };
}

export interface SubWebViewRuntimeScope {
    cloudId: string | null;
    placeId: string | null;
}

export interface SubWebViewDeny {
    deny: SubWebViewDenyReason;
}

export type SubWebViewDecision = SubWebViewAllow | SubWebViewDeny;

type RepositoryName = keyof typeof REPOSITORY_METHODS;
type MethodsOf<R extends RepositoryName> = keyof (typeof REPOSITORY_METHODS)[R] & string;

type RepositoryDecision<R extends RepositoryName> =
    | { closed: SubWebViewDenyReason }
    | { methods: { [M in MethodsOf<R>]: SubWebViewDecision } };

const local = (allow: SubWebViewRuntimePermission) => ({ allow, cost: 'local' }) as const;
const server = (allow: SubWebViewRuntimePermission) => ({ allow, cost: 'server' }) as const;
const deny = (reason: SubWebViewDenyReason) => ({ deny: reason }) as const;
const localListStream = (allow: SubWebViewRuntimePermission) =>
    ({ allow, cost: 'local', guards: [{ is: 'argCount', max: 2 }] }) as const;
const placeList = (allow: SubWebViewRuntimePermission, cost: 'local' | 'server' = 'local') =>
    ({ allow, cost, guards: [{ arg: 0, field: 'sid', is: 'currentPlace' }] }) as const;
const placeListStream = (allow: SubWebViewRuntimePermission) =>
    ({
        allow,
        cost: 'local',
        guards: [
            { is: 'argCount', max: 2 },
            { arg: 0, field: 'sid', is: 'currentPlace' },
        ],
    }) as const;
const inRoom = (allow: SubWebViewRuntimePermission, at: { arg: number; field?: string; each?: boolean }) =>
    ({ allow, cost: 'local', roomInCurrentPlace: at }) as const;
const placeProfile = { allow: 'user', cost: 'local', guards: [{ arg: 0, is: 'currentPlaceKey' }] } as const;

export const SUB_WEB_VIEW_REPOSITORY_WHITELIST = {
    channel: {
        methods: {
            observeList: placeListStream('channel'),
            observeItem: inRoom('channel', { arg: 0 }),
            cacheRead: inRoom('channel', { arg: 0 }),
            cacheReadList: placeList('channel'),
            fetchList: placeList('channel', 'server'),
            refreshList: deny('cacheWrite'),
            refreshOne: deny('cacheWrite'),
            syncChannels: deny('cursor'),
            createChannel: deny('write'),
            startDm: deny('write'),
            updateChannel: deny('write'),
            inviteChannel: deny('write'),
            leaveChannel: deny('write'),
            deleteChannel: deny('write'),
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
            observeList: { ...inRoom('channel', { arg: 0, field: 'channelId' }), guards: [{ is: 'argCount', max: 2 }] },
            cacheReadList: inRoom('channel', { arg: 0, field: 'channelId' }),
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
            observeList: inRoom('chat', { arg: 0, field: 'channelId' }),
            observeLastList: inRoom('chat', { arg: 0, each: true }),
            observeFeedCoverage: inRoom('chat', { arg: 0 }),
            cacheRead: { allow: 'chat', cost: 'local', answerRoomInCurrentPlace: { field: 'channelId' } },
            cacheReadList: inRoom('chat', { arg: 0, field: 'channelId' }),
            listPendingImageChats: inRoom('chat', { arg: 0 }),
            listRoomMedia: deny('cacheWrite'),
            countRoomMedia: deny('cacheWrite'),
            getChat: deny('cacheWrite'),
            refreshList: deny('cacheWrite'),
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
            setReaction: {
                allow: 'chatReact',
                cost: 'react',
                guards: [
                    { is: 'argCount', max: 1 },
                    { arg: 0, is: 'onlyFields', fields: ['chatId', 'emoji', 'action'] },
                    { arg: 0, field: 'chatId', is: 'text', maxLength: 200 },
                    { arg: 0, field: 'emoji', is: 'reaction' },
                    { arg: 0, field: 'action', is: 'oneOf', values: ['on', 'off'] },
                ],
                messageInCurrentPlace: { arg: 0, field: 'chatId' },
            },
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
            observeItem: { allow: 'cloud', cost: 'local', guards: [{ arg: 0, is: 'currentCloud' }] },
            cacheRead: { allow: 'cloud', cost: 'local', guards: [{ arg: 0, is: 'currentCloud' }] },
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
            fetchMiniAppUrl: deny('otherCloud'),
            saveMiniAppUrl: deny('write'),
            listMiniApps: deny('otherCloud'),
            addMiniApp: deny('write'),
            updateMiniApp: deny('write'),
            removeMiniApp: deny('write'),
            verifyCloudEmail: deny('account'),
            cacheWrite: deny('cacheWrite'),
            cacheDelete: deny('cacheWrite'),
            cacheClear: deny('cacheWrite'),
        },
    },
    place: {
        methods: {
            observeList: localListStream('place'),
            observeItem: local('place'),
            cacheReadList: local('place'),
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
            observeList: inRoom('user', { arg: 0, field: 'channelId' }),
            cacheReadList: inRoom('user', { arg: 0, field: 'channelId' }),
            observeItem: deny('otherPlace'),
            cacheRead: deny('otherPlace'),
            listPlaceMembers: {
                allow: 'user',
                cost: 'server',
                guards: [
                    { arg: 0, field: 'placeId', is: 'currentPlace' },
                    { arg: 0, field: 'sessionPlaceId', is: 'currentPlace' },
                    { arg: 0, field: 'pageSize', is: 'absent' },
                ],
            },
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
            observeList: placeListStream('user'),
            observeItem: placeProfile,
            cacheRead: placeProfile,
            cacheReadList: placeList('user'),
            refreshItem: deny('cacheWrite'),
            syncProfilesOf: deny('cacheWrite'),
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
    webhook: { closed: 'admin' },
} as const satisfies { [R in RepositoryName]: RepositoryDecision<R> };

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
    searchCache: deny('otherCloud'),
    resolveCacheContext: deny('otherCloud'),
    registerDeviceToken: deny('device'),
    waitForCloudSocket: deny('internal'),
    holdCloud: deny('internal'),
    observeStateOutbox: deny('internal'),
    cacheMetrics: deny('internal'),
} as const satisfies { [M in keyof RuntimeData]: SubWebViewDeny };

export const SUB_WEB_VIEW_TARGETS = {
    [DATA_TARGET]: 'open',
    [DATA_CLOUD_TARGET]: deny('otherCloud'),
    [SESSION_COMMANDS_TARGET]: deny('account'),
    [CONNECTION_TARGET]: deny('internal'),
    [SYNC_TARGET]: deny('internal'),
} as const satisfies Record<string, 'open' | SubWebViewDeny>;

export interface SubWebViewWhitelistEntry extends SubWebViewAllow {
    method: string;
    crossing: 'call' | 'stream';
}

const isAllow = (decision: SubWebViewDecision): decision is SubWebViewAllow => 'allow' in decision;

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

const own = <T>(table: object, key: string): T | undefined =>
    Object.prototype.hasOwnProperty.call(table, key) ? (table as Record<string, T>)[key] : undefined;

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

const meets = (args: readonly RuntimeWireValue[], guard: SubWebViewArgGuard, scope: SubWebViewRuntimeScope) => {
    if (guard.is === 'argCount') return args.length <= guard.max;
    const argument = args[guard.arg];
    if (guard.is === 'currentPlaceKey') {
        return scope.placeId !== null && typeof argument === 'string' && argument.startsWith(`${scope.placeId}@`);
    }
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
    if (guard.is === 'oneOf') {
        const value = isRecord(argument) ? own<RuntimeWireValue>(argument, guard.field) : undefined;
        return typeof value === 'string' && guard.values.includes(value);
    }
    if (guard.is === 'reaction') {
        const value = isRecord(argument) ? own<RuntimeWireValue>(argument, guard.field) : undefined;
        return typeof value === 'string' && isOneReactionCharacter(value);
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
            const unhandled: never = guard;
            return unhandled;
        }
    }
};

export interface SubWebViewRuntimeRequest {
    kind: 'call' | 'stream';
    target: string;
    method: string;
    args: readonly RuntimeWireValue[];
}

export type SubWebViewRuntimeCheck =
    | { ok: true; entry: SubWebViewWhitelistEntry }
    | { ok: false; reason: SubWebViewRuntimeRefusalReason };

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
    if (entry.crossing !== request.kind) return { ok: false, reason: 'unknown' };
    if (!granted.has(entry.allow)) return { ok: false, reason: 'notGranted' };
    if (entry.guards && !entry.guards.every(guard => meets(request.args, guard, scope))) {
        return { ok: false, reason: 'guard' };
    }
    return { ok: true, entry };
};
