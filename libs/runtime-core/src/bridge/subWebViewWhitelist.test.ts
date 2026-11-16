import type { SubWebViewRuntimePermission } from '@chatic/bridge-messages';

import { REPOSITORY_METHODS } from './repositories';
import {
    SUB_WEB_VIEW_ALLOWED,
    SUB_WEB_VIEW_REPOSITORY_WHITELIST,
    checkSubWebViewRuntimeRequest,
    subWebViewAllowedFor,
    type SubWebViewRuntimeRequest,
    type SubWebViewRuntimeScope,
} from './subWebViewWhitelist';

// --- Compile-time guarantees: ts-jest fails this file on a type error. ---

type W = typeof SUB_WEB_VIEW_REPOSITORY_WHITELIST;
type AllowedName = {
    [R in keyof W]: W[R] extends { methods: infer Ms }
        ? { [M in keyof Ms & string]: Ms[M] extends { allow: string } ? `${R & string}.${M}` : never }[keyof Ms &
              string]
        : never;
}[keyof W];
type CrossingOf<N> = N extends `${infer R}.${infer M}`
    ? R extends keyof typeof REPOSITORY_METHODS
        ? M extends keyof (typeof REPOSITORY_METHODS)[R]
            ? (typeof REPOSITORY_METHODS)[R][M]
            : never
        : never
    : never;
type AllowedStream = { [N in AllowedName]: CrossingOf<N> extends 'stream' ? N : never }[AllowedName];
type IsNever<T> = [T] extends [never] ? true : false;
type ServerRead = {
    [R in keyof W]: W[R] extends { methods: infer Ms }
        ? { [M in keyof Ms & string]: Ms[M] extends { cost: 'server' } ? `${R & string}.${M}` : never }[keyof Ms &
              string]
        : never;
}[keyof W];

/** Names that say they write. An entry flipped to allow by mistake fails here if its name says so. */
type WritingPrefix =
    | 'create'
    | 'update'
    | 'delete'
    | 'leave'
    | 'remove'
    | 'send'
    | 'set'
    | 'start'
    | 'complete'
    | 'fail'
    | 'make'
    | 'release'
    | 'retry'
    | 'invite'
    | 'request'
    | 'unlink'
    | 'evict'
    | 'drop'
    | 'write'
    | 'accept'
    | 'cancel'
    | 'reject'
    | 'dismiss'
    | 'approve'
    | 'deny'
    | 'revoke'
    | 'register'
    | 'submit'
    | 'upload'
    | 'mark'
    | 'read'
    | 'cacheWrite'
    | 'cacheDelete'
    | 'cacheClear'
    // In this runtime a refresh and a sync write what they fetched into the cache.
    | 'refresh'
    | 'sync';

const compileTime: [
    // Nothing allowed is named like a write.
    IsNever<Extract<AllowedName, `${string}.${WritingPrefix}${string}`>>,
    // Nothing allowed reaches another cloud.
    IsNever<Extract<AllowedName, `${string}InCloud`>>,
    // Every allowed server read is one of the three that write nothing of their own choosing.
    IsNever<Exclude<ServerRead, 'channel.fetchList' | 'place.isPlaceDeleted' | 'user.listPlaceMembers'>>,
    // Every allowed stream is an `observe…`.
    IsNever<Exclude<AllowedStream, `${string}.observe${string}`>>,
] = [true, true, true, true];

const grant = (...permissions: SubWebViewRuntimePermission[]) => new Set(permissions);
const ALL = grant('session', 'cloud', 'place', 'channel', 'chat', 'user');
const HERE = { cloudId: 'c1', placeId: 's1' };

const call = (
    method: string,
    args: SubWebViewRuntimeRequest['args'] = [],
    target = 'data'
): SubWebViewRuntimeRequest => ({
    kind: 'call',
    target,
    method,
    args,
});
const stream = (method: string, args: SubWebViewRuntimeRequest['args'] = []): SubWebViewRuntimeRequest => ({
    kind: 'stream',
    target: 'data',
    method,
    args,
});

describe('the sub WebView runtime whitelist', () => {
    it('holds its compile-time guarantees', () => {
        expect(compileTime.every(Boolean)).toBe(true);
    });

    it('decides every repository the runtime contract names', () => {
        expect(Object.keys(SUB_WEB_VIEW_REPOSITORY_WHITELIST).sort()).toEqual(Object.keys(REPOSITORY_METHODS).sort());
    });

    // The reviewed list itself, so a flip of one entry shows up as a diff a reviewer reads.
    it('allows exactly these methods', () => {
        expect([...SUB_WEB_VIEW_ALLOWED.keys()].sort()).toEqual([
            'channel.cacheRead',
            'channel.cacheReadList',
            'channel.fetchList',
            'channel.observeItem',
            'channel.observeList',
            'chat.cacheRead',
            'chat.cacheReadList',
            'chat.listPendingImageChats',
            'chat.observeFeedCoverage',
            'chat.observeLastList',
            'chat.observeList',
            'cloud.cacheRead',
            'cloud.observeItem',
            'join.cacheReadList',
            'join.observeList',
            'place.cacheReadList',
            'place.isPlaceDeleted',
            'place.observeItem',
            'place.observeList',
            'profile.cacheRead',
            'profile.cacheReadList',
            'profile.observeItem',
            'profile.observeList',
            'user.cacheRead',
            'user.cacheReadList',
            'user.listPlaceMembers',
            'user.observeItem',
            'user.observeList',
        ]);
    });

    it('takes each crossing from the runtime contract', () => {
        expect(SUB_WEB_VIEW_ALLOWED.get('channel.observeList')?.crossing).toBe('stream');
        expect(SUB_WEB_VIEW_ALLOWED.get('channel.fetchList')?.crossing).toBe('call');
    });
});

describe('checkSubWebViewRuntimeRequest', () => {
    it('lets a granted read through, with its cost', () => {
        const local = checkSubWebViewRuntimeRequest(stream('channel.observeList', [{}]), grant('channel'), HERE);
        expect(local).toEqual({ ok: true, entry: expect.objectContaining({ allow: 'channel', cost: 'local' }) });

        const server = checkSubWebViewRuntimeRequest(
            call('channel.fetchList', [{ sid: 's2' }]),
            grant('channel'),
            HERE
        );
        expect(server).toEqual({ ok: true, entry: expect.objectContaining({ allow: 'channel', cost: 'server' }) });
    });

    it('refuses an open method whose permission the page does not hold', () => {
        expect(checkSubWebViewRuntimeRequest(call('chat.cacheRead', ['x']), grant('channel'), HERE)).toEqual({
            ok: false,
            reason: 'notGranted',
        });
    });

    it('refuses a closed method with its reason, whatever is granted', () => {
        expect(checkSubWebViewRuntimeRequest(call('chat.sendChat', [{}]), ALL, HERE)).toEqual({
            ok: false,
            reason: 'write',
        });
        expect(checkSubWebViewRuntimeRequest(call('join.readChat', []), ALL, HERE)).toEqual({
            ok: false,
            reason: 'cursor',
        });
        expect(checkSubWebViewRuntimeRequest(call('channel.refreshOneInCloud', []), ALL, HERE)).toEqual({
            ok: false,
            reason: 'otherCloud',
        });
        expect(checkSubWebViewRuntimeRequest(call('profile.getMyProfile', []), ALL, HERE)).toEqual({
            ok: false,
            reason: 'serverSideEffect',
        });
    });

    // The page's arguments would decide where the rows land: `{ sid }` of another place files this
    // place's rooms under it.
    it.each([
        'channel.refreshList',
        'channel.refreshOne',
        'chat.refreshList',
        'chat.getChat',
        'chat.listRoomMedia',
        'cloud.getCloud',
        'place.refreshList',
        'user.getMyProfile',
        'user.syncChannelUsers',
        'profile.refreshItem',
        'profile.syncProfilesOf',
    ])('refuses %s, a read that writes what it fetched', method => {
        expect(checkSubWebViewRuntimeRequest(call(method, [{ sid: 's2' }]), ALL, HERE)).toEqual({
            ok: false,
            reason: 'cacheWrite',
        });
    });

    it('holds the member list to the committed place, in the server page size', () => {
        const members = (query: Record<string, string | number>, scope: SubWebViewRuntimeScope = HERE) =>
            checkSubWebViewRuntimeRequest(call('user.listPlaceMembers', [query]), ALL, scope);

        expect(members({ placeId: 's1', sessionPlaceId: 's1' }).ok).toBe(true);
        expect(members({ placeId: 's2', sessionPlaceId: 's2' })).toEqual({ ok: false, reason: 'guard' });
        expect(members({ placeId: 's1', sessionPlaceId: 's2' })).toEqual({ ok: false, reason: 'guard' });
        expect(members({ placeId: 's1', sessionPlaceId: 's1', pageSize: 1 })).toEqual({ ok: false, reason: 'guard' });
        expect(members({ placeId: 's1', sessionPlaceId: 's1' }, { cloudId: 'c1', placeId: null })).toEqual({
            ok: false,
            reason: 'guard',
        });
    });

    it('reads no inherited name off a table', () => {
        expect(checkSubWebViewRuntimeRequest(call('__proto__.x', []), ALL, HERE)).toEqual({
            ok: false,
            reason: 'unknown',
        });
        expect(checkSubWebViewRuntimeRequest(call('constructor', []), ALL, HERE)).toEqual({
            ok: false,
            reason: 'unknown',
        });
        expect(checkSubWebViewRuntimeRequest(call('x', [], '__proto__'), ALL, HERE)).toEqual({
            ok: false,
            reason: 'unknown',
        });
    });

    it('refuses a closed repository with its one reason', () => {
        expect(checkSubWebViewRuntimeRequest(call('auth.sendPhoneCode', []), ALL, HERE)).toEqual({
            ok: false,
            reason: 'account',
        });
        expect(checkSubWebViewRuntimeRequest(call('syncMeta.getSyncedAt', []), ALL, HERE)).toEqual({
            ok: false,
            reason: 'cursor',
        });
    });

    it('refuses the rest of the data target', () => {
        expect(checkSubWebViewRuntimeRequest(call('searchCache', ['q']), ALL, HERE)).toEqual({
            ok: false,
            reason: 'otherCloud',
        });
        expect(checkSubWebViewRuntimeRequest(call('holdCloud', []), ALL, HERE)).toEqual({
            ok: false,
            reason: 'internal',
        });
    });

    it('refuses every target but data — the switches live under session', () => {
        expect(checkSubWebViewRuntimeRequest(call('switchSite', ['s2'], 'session'), ALL, HERE)).toEqual({
            ok: false,
            reason: 'account',
        });
        expect(checkSubWebViewRuntimeRequest(call('channel.fetchList', ['c2', {}], 'data@cloud'), ALL, HERE)).toEqual({
            ok: false,
            reason: 'otherCloud',
        });
        expect(checkSubWebViewRuntimeRequest(call('snapshot', [], 'connection'), ALL, HERE)).toEqual({
            ok: false,
            reason: 'internal',
        });
        expect(checkSubWebViewRuntimeRequest(call('anything', [], 'nowhere'), ALL, HERE)).toEqual({
            ok: false,
            reason: 'unknown',
        });
    });

    it('refuses a name it does not know, and a method asked the wrong way', () => {
        expect(checkSubWebViewRuntimeRequest(call('channel.nothing', []), ALL, HERE)).toEqual({
            ok: false,
            reason: 'unknown',
        });
        expect(checkSubWebViewRuntimeRequest(call('channel.observeList', [{}]), ALL, HERE)).toEqual({
            ok: false,
            reason: 'unknown',
        });
        expect(checkSubWebViewRuntimeRequest(stream('channel.fetchList', [{}]), ALL, HERE)).toEqual({
            ok: false,
            reason: 'unknown',
        });
    });

    it('holds a cloud read to the current cloud', () => {
        expect(checkSubWebViewRuntimeRequest(call('cloud.cacheRead', ['c1']), ALL, HERE).ok).toBe(true);
        expect(
            checkSubWebViewRuntimeRequest(stream('cloud.observeItem', ['c1', { $listener: true }]), ALL, HERE).ok
        ).toBe(true);
        expect(checkSubWebViewRuntimeRequest(call('cloud.cacheRead', ['c2']), ALL, HERE)).toEqual({
            ok: false,
            reason: 'guard',
        });
        expect(checkSubWebViewRuntimeRequest(call('cloud.cacheRead', [{ id: 'c1' }]), ALL, HERE)).toEqual({
            ok: false,
            reason: 'guard',
        });
        expect(
            checkSubWebViewRuntimeRequest(call('cloud.cacheRead', ['c1']), ALL, { cloudId: null, placeId: null })
        ).toEqual({
            ok: false,
            reason: 'guard',
        });
    });
});

describe('subWebViewAllowedFor', () => {
    it('opens nothing without a permission', () => {
        expect(subWebViewAllowedFor(new Set())).toEqual({ calls: [], streams: [] });
    });

    it("opens a permission's calls and streams, sorted, and nothing of another", () => {
        const { calls, streams } = subWebViewAllowedFor(grant('channel'));
        expect(calls).toEqual([
            'channel.cacheRead',
            'channel.cacheReadList',
            'channel.fetchList',
            'join.cacheReadList',
        ]);
        expect(streams).toEqual(['channel.observeItem', 'channel.observeList', 'join.observeList']);
    });

    it('opens nothing for session alone: the session crosses in the hello, not as a method', () => {
        expect(subWebViewAllowedFor(grant('session'))).toEqual({ calls: [], streams: [] });
    });
});
