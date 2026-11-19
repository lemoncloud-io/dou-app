import type { SubWebViewRuntimePermission } from '@chatic/bridge-messages';

import { REPOSITORY_METHODS } from './repositories';
import {
    SUB_WEB_VIEW_ALLOWED,
    SUB_WEB_VIEW_MESSAGE_LIMIT,
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

type Send = {
    [R in keyof W]: W[R] extends { methods: infer Ms }
        ? { [M in keyof Ms & string]: Ms[M] extends { cost: 'send' } ? `${R & string}.${M}` : never }[keyof Ms & string]
        : never;
}[keyof W];

const compileTime: [
    // Nothing allowed is named like a write, but the one text send `chatSend` opens.
    IsNever<Exclude<Extract<AllowedName, `${string}.${WritingPrefix}${string}`>, 'chat.sendChat'>>,
    // The one write is budgeted as a send, never as a read.
    IsNever<Exclude<Send, 'chat.sendChat'>>,
    // Nothing allowed reaches another cloud.
    IsNever<Extract<AllowedName, `${string}InCloud`>>,
    // Every allowed server read is one of these, which write nothing of the page's choosing — and
    // `cloud.getCloud` nothing at all, since its guard holds the page to `{ cache: false }`.
    IsNever<
        Exclude<ServerRead, 'channel.fetchList' | 'place.isPlaceDeleted' | 'user.listPlaceMembers' | 'cloud.getCloud'>
    >,
    // Every allowed stream is an `observe…`.
    IsNever<Exclude<AllowedStream, `${string}.observe${string}`>>,
] = [true, true, true, true, true];

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
            'chat.sendChat',
            'cloud.cacheRead',
            'cloud.getCloud',
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
            'user.cacheReadList',
            'user.listPlaceMembers',
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
        const local = checkSubWebViewRuntimeRequest(
            stream('channel.observeList', [{ sid: 's1' }]),
            grant('channel'),
            HERE
        );
        expect(local).toEqual({ ok: true, entry: expect.objectContaining({ allow: 'channel', cost: 'local' }) });

        const server = checkSubWebViewRuntimeRequest(
            call('channel.fetchList', [{ sid: 's1' }]),
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
        expect(checkSubWebViewRuntimeRequest(call('chat.updateChat', [{}]), ALL, HERE)).toEqual({
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

    it.each([
        ['channel.observeList', 'channel'],
        ['join.observeList', 'channel'],
        ['place.observeList', 'place'],
    ] as const)('refuses a %s that names a cache partition of its own', (method, permission) => {
        const LISTENER = { $listener: true };
        const query = { sid: 's1', channelId: 'r1' };
        expect(checkSubWebViewRuntimeRequest(stream(method, [query, LISTENER]), grant(permission), HERE).ok).toBe(true);
        expect(
            checkSubWebViewRuntimeRequest(
                stream(method, [query, LISTENER, { cid: 'c2', uid: 'u2' }]),
                grant(permission),
                HERE
            )
        ).toEqual({ ok: false, reason: 'guard' });
    });

    it.each([
        ['channel.observeList', 'stream'],
        ['channel.cacheReadList', 'call'],
        ['channel.fetchList', 'call'],
        ['profile.observeList', 'stream'],
        ['profile.cacheReadList', 'call'],
    ] as const)("holds %s to the place the view opened on, named by the query's sid", (method, kind) => {
        const ask = (query: Record<string, string>, scope = HERE) =>
            checkSubWebViewRuntimeRequest(
                kind === 'stream' ? stream(method, [query]) : call(method, [query]),
                ALL,
                scope
            );

        expect(ask({ sid: 's1' }).ok).toBe(true);
        expect(ask({ sid: 's2' })).toEqual({ ok: false, reason: 'guard' });
        expect(ask({})).toEqual({ ok: false, reason: 'guard' });
        // The session left the place the view opened on: the shell passes no place.
        expect(ask({ sid: 's1' }, { cloudId: 'c1', placeId: null as never })).toEqual({ ok: false, reason: 'guard' });
    });

    it("holds a place profile to the place the view opened on, by its '<place>@<user>' key", () => {
        expect(checkSubWebViewRuntimeRequest(call('profile.cacheRead', ['s1@u2']), ALL, HERE).ok).toBe(true);
        expect(
            checkSubWebViewRuntimeRequest(stream('profile.observeItem', ['s1@u2', { $listener: true }]), ALL, HERE).ok
        ).toBe(true);
        for (const key of ['s2@u2', 's1', 'u2', 's1x@u2']) {
            expect(checkSubWebViewRuntimeRequest(call('profile.cacheRead', [key]), ALL, HERE)).toEqual({
                ok: false,
                reason: 'guard',
            });
        }
    });

    it("closes a user row by its id, which is the cloud's and not a place's", () => {
        expect(checkSubWebViewRuntimeRequest(call('user.cacheRead', ['u2']), ALL, HERE)).toEqual({
            ok: false,
            reason: 'otherPlace',
        });
        expect(checkSubWebViewRuntimeRequest(stream('user.observeItem', ['u2']), ALL, HERE)).toEqual({
            ok: false,
            reason: 'otherPlace',
        });
    });

    it("leaves a room's own check to the shell: which reads name a room, and where", () => {
        const roomOf = (method: string) => SUB_WEB_VIEW_ALLOWED.get(method)?.roomInCurrentPlace;
        expect(roomOf('channel.cacheRead')).toEqual({ arg: 0 });
        expect(roomOf('channel.observeItem')).toEqual({ arg: 0 });
        expect(roomOf('join.cacheReadList')).toEqual({ arg: 0, field: 'channelId' });
        expect(roomOf('join.observeList')).toEqual({ arg: 0, field: 'channelId' });
        expect(roomOf('chat.observeList')).toEqual({ arg: 0, field: 'channelId' });
        expect(roomOf('chat.cacheReadList')).toEqual({ arg: 0, field: 'channelId' });
        expect(roomOf('chat.observeLastList')).toEqual({ arg: 0, each: true });
        expect(roomOf('chat.observeFeedCoverage')).toEqual({ arg: 0 });
        expect(roomOf('chat.listPendingImageChats')).toEqual({ arg: 0 });
        expect(roomOf('user.observeList')).toEqual({ arg: 0, field: 'channelId' });
        expect(roomOf('user.cacheReadList')).toEqual({ arg: 0, field: 'channelId' });
        expect(SUB_WEB_VIEW_ALLOWED.get('chat.cacheRead')?.answerRoomInCurrentPlace).toEqual({ field: 'channelId' });
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

describe("checkSubWebViewRuntimeRequest — the current cloud's server view", () => {
    const getCloud = (...args: SubWebViewRuntimeRequest['args']) =>
        checkSubWebViewRuntimeRequest(call('cloud.getCloud', args), ALL, HERE);

    it('reads the current cloud from the server when the page turns the cache write off', () => {
        const check = getCloud({ id: 'c1' }, { cache: false });
        expect(check.ok).toBe(true);
        if (check.ok) expect(check.entry.cost).toBe('server');
    });

    it.each([
        ['without options, which would write the cloud into the cache', [{ id: 'c1' }]],
        ['with the cache write on', [{ id: 'c1' }, { cache: true }]],
        ['with the cache option as anything but false', [{ id: 'c1' }, { cache: 'false' }]],
        ['for another cloud', [{ id: 'c2' }, { cache: false }]],
        ['naming the cloud by cid', [{ cid: 'c1' }, { cache: false }]],
        ['naming it by id and another cid besides', [{ id: 'c1', cid: 'c2' }, { cache: false }]],
        ['with the cloud as a bare id', ['c1', { cache: false }]],
    ])('refuses it %s', (_case, args) => {
        expect(getCloud(...(args as SubWebViewRuntimeRequest['args']))).toEqual({ ok: false, reason: 'guard' });
    });

    it('needs the cloud permission', () => {
        expect(
            checkSubWebViewRuntimeRequest(
                call('cloud.getCloud', [{ id: 'c1' }, { cache: false }]),
                grant('channel'),
                HERE
            )
        ).toEqual({
            ok: false,
            reason: 'notGranted',
        });
    });
});

describe('checkSubWebViewRuntimeRequest — a text message', () => {
    const SEND = grant('chatSend');
    const send = (...args: SubWebViewRuntimeRequest['args']) =>
        checkSubWebViewRuntimeRequest(call('chat.sendChat', args), SEND, HERE);

    it('lets a plain text message through as a send, with the room for the shell to check', () => {
        const check = send({ channelId: 'r1', content: '3' });
        expect(check.ok).toBe(true);
        if (check.ok) {
            expect(check.entry.cost).toBe('send');
            expect(check.entry.roomInCurrentPlace).toEqual({ arg: 0, field: 'channelId' });
        }
    });

    it('takes a message up to the limit, and refuses one past it', () => {
        expect(send({ channelId: 'r1', content: 'x'.repeat(SUB_WEB_VIEW_MESSAGE_LIMIT) }).ok).toBe(true);
        expect(send({ channelId: 'r1', content: 'x'.repeat(SUB_WEB_VIEW_MESSAGE_LIMIT + 1) })).toEqual({
            ok: false,
            reason: 'guard',
        });
    });

    it.each([
        ['with attachments', { channelId: 'r1', content: 'hi', uploadIds: ['u1'] }],
        ['with a mention', { channelId: 'r1', content: 'hi', mention: { all: true } }],
        ['as a reply', { channelId: 'r1', content: 'hi', parentId: 'm1' }],
        ['as a system row', { channelId: 'r1', content: 'hi', stereo: 'system' }],
        ['as a webhook row', { channelId: 'r1', content: 'hi', force: true, meta: {} }],
        ['with a content type', { channelId: 'r1', content: 'hi', contentType: 'html' }],
        ['with nothing in it but white space', { channelId: 'r1', content: '  \n ' }],
        ['with no text', { channelId: 'r1' }],
        ['with text that is not a string', { channelId: 'r1', content: 3 }],
        ['with no room', { content: 'hi' }],
        ['with an empty room', { channelId: '', content: 'hi' }],
    ])('refuses a message %s', (_case, payload) => {
        expect(send(payload as SubWebViewRuntimeRequest['args'][number])).toEqual({ ok: false, reason: 'guard' });
    });

    it('refuses an argument past the message, which nothing has decided', () => {
        expect(send({ channelId: 'r1', content: 'hi' }, { silent: true })).toEqual({ ok: false, reason: 'guard' });
    });

    it('refuses an own __proto__ key, as JSON hands it over', () => {
        const payload = JSON.parse('{"channelId":"r1","content":"hi","__proto__":{"uploadIds":["u1"]}}');
        expect(send(payload)).toEqual({ ok: false, reason: 'guard' });
    });

    it('refuses a message that is not an object', () => {
        expect(send('hi')).toEqual({ ok: false, reason: 'guard' });
        expect(send()).toEqual({ ok: false, reason: 'guard' });
    });

    it('needs chatSend: the reads, all of them, do not open it', () => {
        expect(
            checkSubWebViewRuntimeRequest(call('chat.sendChat', [{ channelId: 'r1', content: 'hi' }]), ALL, HERE)
        ).toEqual({
            ok: false,
            reason: 'notGranted',
        });
    });

    it('keeps sending to another cloud closed', () => {
        expect(checkSubWebViewRuntimeRequest(call('sendChatInCloud', []), SEND, HERE)).toEqual({
            ok: false,
            reason: 'write',
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

    it('opens the text send alone for chatSend', () => {
        expect(subWebViewAllowedFor(grant('chatSend'))).toEqual({ calls: ['chat.sendChat'], streams: [] });
    });

    it('opens nothing for session alone: the session crosses in the hello, not as a method', () => {
        expect(subWebViewAllowedFor(grant('session'))).toEqual({ calls: [], streams: [] });
    });
});
