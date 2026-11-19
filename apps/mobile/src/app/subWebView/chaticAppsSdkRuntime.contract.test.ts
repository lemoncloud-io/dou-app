/**
 * @jest-environment node
 */
// Node, not jsdom: the runtime's socket client needs `TextEncoder`, which jsdom leaves out. The
// reference mini-app gets a window of its own.
import * as fs from 'fs';
import * as path from 'path';

import * as ts from 'typescript';

import type {
    CacheChannelView,
    CacheChatView,
    CacheCloudView,
    CacheJoinView,
    CacheProfileView,
    CacheSiteView,
    CacheUserView,
    SubWebViewRuntimePermission,
} from '@chatic/bridge-messages';
import {
    SDK_DATA_CONTRACTS,
    type ChaticAppsError,
    type DataCallName,
    type DataCalls,
    type CloudChannel,
    type CloudChat,
    type CloudChatBlock,
    type CloudInfo,
    type CloudJoin,
    type CloudPendingUpload,
    type CloudPlace,
    type CloudProfile,
    type CloudSession,
    type DataStreamName,
    type DataStreams,
    type CloudUpload,
    type CloudUser,
} from '@chatic/chatic-apps-sdk';
import { connectOver, type Transport } from '@chatic/chatic-apps-sdk/internal';
import { loadEntry, openPage, settle as pageSettle, type OpenedPage } from '@chatic/chatic-apps-devtools';
import {
    RUNTIME_CONTRACTS,
    createRuntimeBridgeHost,
    subWebViewAllowedFor,
    type RuntimeEngine,
} from '@chatic/runtime-mobile';

import { memoryStorageFile } from '../services/subWebView/memoryStorageFile';
import { SubWebViewService } from '../services/subWebView/SubWebViewService';
import { SubWebViewStorage } from '../services/subWebView/subWebViewStorage';
import { createSubBridgeHost } from './createSubBridgeHost';
import { createSubBridgeHandlers, permittedSubBridgeHandlers } from './subBridgeHandlers';
import { createSubWebViewRuntimeBridge, type sessionForPage } from './subWebViewRuntimeBridge';
import type { SubWebViewReadBudget } from './subWebViewReadBudget';

// The runtime package reads these at import; nothing here reaches them.
jest.mock('react-native', () => ({
    AppState: { currentState: 'active', addEventListener: jest.fn() },
    Platform: { OS: 'ios' },
}));
jest.mock('@react-native-community/netinfo', () => ({ addEventListener: jest.fn(), fetch: jest.fn() }));

/**
 * The library pages are built with, reading the app's runtime through this app's real page host, the
 * sub WebView's runtime bridge and the runtime's own bridge host, in one process — only the engine
 * behind them is a stand-in. What the library sends is what the whitelist passes and the runtime
 * answers; a change on either side that breaks a page's read fails here.
 */

const setup = ({
    granted = ['channel'] as SubWebViewRuntimePermission[],
    budget = { take: () => ({ ok: true }) } as SubWebViewReadBudget,
} = {}) => {
    let cloudId = 'c1';
    let placeId = 's1';
    const sessionListeners = new Set<() => void>();
    const roomListeners = new Set<(result: unknown) => void>();
    const rooms = [
        { id: 'ch1', cid: 'c1', sid: 's1' },
        { id: 'elsewhere', cid: 'c1', sid: 's2' },
    ];
    const profiles = [
        { id: 's1@u1', cid: 'c1', sid: 's1', uid: 'u1', userId: 'u1', updatedAtMs: 1, nick: 'Me' },
        { id: 's1@u2', cid: 'c1', sid: 's1', uid: 'u2', userId: 'u2', updatedAtMs: 1, nick: 'Them' },
        { id: 's2@u2', cid: 'c1', sid: 's2', uid: 'u2', userId: 'u2', updatedAtMs: 1, nick: 'Them elsewhere' },
    ];
    const sendChat = jest.fn(async (input: { channelId: string; content: string }) => ({
        id: 'm1',
        cid: 'c1',
        channelId: input.channelId,
        chatNo: 3,
        isPending: false,
        isFailed: false,
        createdAtMs: 1,
        updatedAtMs: 1,
        content: input.content,
    }));
    const engine = {
        session: {
            snapshot: () => ({
                context: {
                    cloud: { cloudId, siteId: placeId, isActive: true },
                    identity: { userId: 'u1', isAuthenticated: true },
                },
                committedSiteId: placeId,
            }),
            subscribe: (listener: () => void) => {
                sessionListeners.add(listener);
                return () => sessionListeners.delete(listener);
            },
            onLogout: () => () => undefined,
        },
        data: {
            repositories: () => ({
                chat: { sendChat },
                profile: {
                    cacheRead: async (id: string) => profiles.find(profile => profile.id === id) ?? null,
                    cacheReadList: async (query: { sid?: string }) => ({
                        list: profiles.filter(profile => profile.sid === query.sid),
                    }),
                },
                channel: {
                    cacheRead: async (id: string) => rooms.find(room => room.id === id) ?? null,
                    cacheReadList: async (query: unknown) => ({ list: [{ id: 'ch1', name: 'General' }], query }),
                    fetchList: async () => ({ list: [] }),
                    observeList: (_query: unknown, listener: (result: unknown) => void) => {
                        roomListeners.add(listener);
                        return () => roomListeners.delete(listener);
                    },
                },
            }),
        },
    } as unknown as RuntimeEngine;

    let toPage: ((message: string) => void) | undefined;
    let host: ReturnType<typeof createSubBridgeHost> | null = null;
    const pageHost = () => host;
    const runtime = createSubWebViewRuntimeBridge({
        createHost: send => createRuntimeBridgeHost({ engine: async () => engine, send }),
        session: engine.session,
        openedCloudId: 'c1',
        openedPlaceId: 's1',
        granted: new Set(granted),
        origin: 'https://quiz.apps.chatic.io',
        pageHost,
        consent: { ensure: async () => 'allowed' },
        budget,
        sends: { take: () => ({ ok: true }) },
    });
    host = createSubBridgeHost(
        // Asynchronous, as the WebView is.
        message => queueMicrotask(() => toPage?.(message)),
        runtime.handlers,
        () => ({
            protocolVersion: 1,
            viewId: 'view-1',
            platform: 'ios',
            appVersion: '0.31.0',
            locale: 'ko',
            theme: 'light',
            params: {},
        })
    );
    const transport: Transport = {
        send: message => void host?.handleMessage(message),
        listen: listener => {
            toPage = listener;
            return () => (toPage = undefined);
        },
    };
    return {
        transport,
        runtime,
        sendChat,
        emitRooms: (result: unknown) => roomListeners.forEach(listener => listener(result)),
        moveTo: (next: string) => {
            cloudId = next;
            sessionListeners.forEach(listener => listener());
        },
        moveToPlace: (next: string) => {
            placeId = next;
            sessionListeners.forEach(listener => listener());
        },
    };
};

const settle = () => new Promise(resolve => setTimeout(resolve, 0));

describe('chatic-apps-sdk reading the runtime through the page host', () => {
    it('speaks the runtime contracts this app does', () => {
        expect(SDK_DATA_CONTRACTS).toEqual(RUNTIME_CONTRACTS);
    });

    it('connects and reads what the whitelist opens for its permissions', async () => {
        const { transport } = setup();
        const apps = await connectOver(transport, { reportErrors: false });

        expect(apps.supports('data')).toBe(true);
        const connection = await apps.data.connect();
        expect(connection.allowed.calls).toContain('channel.cacheReadList');
        expect(connection.allowed.calls).not.toContain('chat.getChat');

        await expect(apps.data.call('channel.cacheReadList', { sid: 's1' })).resolves.toEqual({
            list: [{ id: 'ch1', name: 'General' }],
            query: { sid: 's1' },
        });
        apps.disconnect();
    });

    it('reads only the place the view opened on, and nothing of a place once the user moved', async () => {
        const { transport, moveToPlace } = setup();
        const apps = await connectOver(transport, { reportErrors: false });
        const refused = expect.objectContaining({ code: 'RUNTIME_NOT_ALLOWED' });

        await expect(apps.data.call('channel.cacheRead', 'ch1')).resolves.toEqual(
            expect.objectContaining({ sid: 's1' })
        );
        await expect(apps.data.call('channel.cacheRead', 'elsewhere')).rejects.toEqual(refused);
        await expect(apps.data.call('channel.cacheReadList', { sid: 's2' })).rejects.toEqual(refused);
        await expect(apps.data.call('channel.cacheReadList', {})).rejects.toEqual(refused);

        moveToPlace('s2');
        await expect(apps.data.call('channel.cacheReadList', { sid: 's1' })).rejects.toEqual(refused);
        await expect(apps.data.call('channel.cacheReadList', { sid: 's2' })).rejects.toEqual(refused);
        apps.disconnect();
    });

    it("names the place's members by their place profiles, and no one else", async () => {
        const { transport } = setup({ granted: ['session', 'user'] });
        const apps = await connectOver(transport, { reportErrors: false });

        await expect(apps.data.myProfile()).resolves.toEqual(expect.objectContaining({ nick: 'Me' }));
        await expect(apps.data.placeProfile('u2')).resolves.toEqual(expect.objectContaining({ nick: 'Them' }));
        await expect(apps.data.placeProfiles()).resolves.toEqual({
            list: [expect.objectContaining({ id: 's1@u1' }), expect.objectContaining({ id: 's1@u2' })],
        });
        await expect(apps.data.call('profile.cacheRead', 's2@u2')).rejects.toEqual(
            expect.objectContaining({ code: 'RUNTIME_NOT_ALLOWED' })
        );
        // A user row is the cloud's: by its id it is not open at all.
        await expect(apps.data.call<unknown>('user.cacheRead' as never, 'u2')).rejects.toEqual(
            expect.objectContaining({ code: 'RUNTIME_NOT_ALLOWED' })
        );
        apps.disconnect();
    });

    it("hears a stream's events, and its end when the cloud changes", async () => {
        const { transport, emitRooms, moveTo } = setup();
        const apps = await connectOver(transport, { reportErrors: false });
        const listener = jest.fn();
        const onEnd = jest.fn();
        const onCloudChanged = jest.fn();
        apps.data.onCloudChanged(onCloudChanged);

        await apps.data.subscribe('channel.observeList', [{ sid: 's1' }], listener, onEnd);
        emitRooms({ list: [{ id: 'ch2' }] });
        await settle();
        expect(listener).toHaveBeenCalledWith({ list: [{ id: 'ch2' }] });

        moveTo('c2');
        await settle();
        expect((onEnd.mock.calls[0]?.[0] as ChaticAppsError | undefined)?.code).toBe('CLOUD_CHANGED');
        expect(onCloudChanged).toHaveBeenCalledTimes(1);
        apps.disconnect();
    });

    it("hands the host's refusal back with its details", async () => {
        const { transport } = setup({ budget: { take: () => ({ ok: false, retryAfterMs: 90 }) } });
        const apps = await connectOver(transport, { reportErrors: false });

        await expect(apps.data.call('channel.fetchList', { sid: 's1' })).rejects.toEqual(
            expect.objectContaining({ code: 'RATE_LIMITED', details: { retryAfterMs: 90 } })
        );
        apps.disconnect();
    });

    it('sends a text message with `chatSend`, to a room of the place the view opened on only', async () => {
        const { transport, sendChat } = setup({ granted: ['chatSend'] });
        const apps = await connectOver(transport, { reportErrors: false });

        await expect(apps.data.sendMessage('ch1', 'hello')).resolves.toEqual(
            expect.objectContaining({ id: 'm1', channelId: 'ch1', content: 'hello' })
        );
        expect(sendChat).toHaveBeenCalledWith({ channelId: 'ch1', content: 'hello' });

        await expect(apps.data.sendMessage('elsewhere', 'hello')).rejects.toEqual(
            expect.objectContaining({ code: 'RUNTIME_NOT_ALLOWED' })
        );
        expect(sendChat).toHaveBeenCalledTimes(1);
        apps.disconnect();
    });

    it('refuses a send without `chatSend`', async () => {
        const { transport, sendChat } = setup({ granted: ['chat'] });
        const apps = await connectOver(transport, { reportErrors: false });

        await expect(apps.data.sendMessage('ch1', 'hello')).rejects.toEqual(
            expect.objectContaining({ code: 'RUNTIME_NOT_ALLOWED' })
        );
        expect(sendChat).not.toHaveBeenCalled();
        apps.disconnect();
    });

    it('gives the session only with `session`', async () => {
        const without = setup({ granted: ['channel'] });
        const apps = await connectOver(without.transport, { reportErrors: false });
        await apps.data.connect();
        expect(apps.data.session()).toBeNull();
        apps.disconnect();

        const withIt = setup({ granted: ['session'] });
        const other = await connectOver(withIt.transport, { reportErrors: false });
        await other.data.connect();
        expect(other.data.session()).toEqual(expect.objectContaining({ context: expect.anything() }));
        other.disconnect();
    });
});

// ---------------------------------------------------------------------------------------------------
// The library's typed runtime against the app's own types.
//
// The library declares the rows, arguments and session by hand (it cannot import the app's private
// types), so the checks below hold each declaration to the app's: the methods the whitelist opens, each
// method's arguments and answer, and every row field by field — its name, whether it is optional, and its
// type. They are compile-time checks, and this suite's transform does not type check, nor does CI run
// this app's typecheck; so the last test compiles this file and fails on any error in it.
// ---------------------------------------------------------------------------------------------------

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type IsAny<T> = 0 extends 1 & T ? true : false;
type Primitive = string | number | boolean | bigint | symbol | null | undefined;
type IsUnion<T, U = T> = T extends unknown ? ([U] extends [T] ? false : true) : never;
type RequiredKeys<T> = { [K in keyof T]-?: object extends Pick<T, K> ? never : K }[keyof T];
type AllTrue<T> = false extends T[keyof T] ? false : true;
type Depth = [unknown, unknown, unknown, unknown];
/** A tuple's length, or `number` for an array. */
type SameLength<T> = T extends readonly unknown[] ? T['length'] : never;

/**
 * `S` (the library's) declares exactly what `A` (the app's) is: the same fields, the same optional ones,
 * each of the same type, down to `Depth` levels of embedded views. A field typed `any` on the app's side
 * (`meta`) is the server's own and only has to be there. A union of objects (a message's files, its
 * blocks) is held to assignability both ways here and checked member by member below.
 */
type Same<S, A, D extends unknown[] = []> =
    IsAny<A> extends true
        ? unknown extends S
            ? true
            : false
        : [S] extends [Primitive]
          ? Equal<S, A>
          : Equal<Extract<S, null | undefined>, Extract<A, null | undefined>> extends true
            ? SameValue<NonNullable<S>, NonNullable<A>, D>
            : false;
type SameValue<S, A, D extends unknown[]> = [S] extends [Primitive]
    ? Equal<S, A>
    : D['length'] extends Depth['length']
      ? true
      : [S] extends [readonly (infer SE)[]]
        ? [A] extends [readonly (infer AE)[]]
            ? // A tuple (a number range, an event's arguments) is held to its length as well.
              Equal<SameLength<S>, SameLength<A>> extends true
                ? Same<SE, AE, [...D, unknown]>
                : false
            : false
        : IsUnion<S> extends true
          ? [S] extends [A]
              ? [A] extends [S]
                  ? true
                  : false
              : false
          : SameObject<S, A, D>;
type SameObject<S, A, D extends unknown[]> =
    Equal<keyof S, keyof A> extends true
        ? Equal<RequiredKeys<S>, RequiredKeys<A>> extends true
            ? AllTrue<{ [K in keyof S & keyof A]-?: Same<S[K], A[K], [...D, unknown]> }>
            : false
        : false;

type AppRepositories = ReturnType<RuntimeEngine['data']['repositories']>;
type AppMethod<N extends string> = N extends `${infer R}.${infer M}`
    ? R extends keyof AppRepositories
        ? M extends keyof AppRepositories[R]
            ? AppRepositories[R][M] extends (...args: never[]) => unknown
                ? AppRepositories[R][M]
                : never
            : never
        : never
    : never;

/** A call: the library's arguments are ones the app's method takes, and its answer is the app's. */
type CallMatches<N extends DataCallName> =
    DataCalls[N]['args'] extends Parameters<AppMethod<N>>
        ? Same<DataCalls[N]['result'], Awaited<ReturnType<AppMethod<N>>>>
        : false;

/**
 * A stream: the app's method takes its callback right after the library's arguments (where `subscribe`
 * puts the listener), and the callback hears what the library says each event carries.
 */
type StreamMatches<N extends DataStreamName> = Parameters<AppMethod<N>>[DataStreams[N]['args']['length']] extends (
    ...event: infer AppEvent
) => void
    ? [...DataStreams[N]['args'], Parameters<AppMethod<N>>[DataStreams[N]['args']['length']]] extends Parameters<
          AppMethod<N>
      >
        ? Same<DataStreams[N]['event'], AppEvent>
        : false
    : false;

const callsMatch: { [N in DataCallName]: CallMatches<N> } = {
    'channel.cacheRead': true,
    'channel.cacheReadList': true,
    'channel.fetchList': true,
    'join.cacheReadList': true,
    'chat.cacheRead': true,
    'chat.cacheReadList': true,
    'chat.listPendingImageChats': true,
    'chat.sendChat': true,
    'cloud.cacheRead': true,
    'cloud.getCloud': true,
    'place.cacheReadList': true,
    'place.isPlaceDeleted': true,
    'user.cacheReadList': true,
    'user.listPlaceMembers': true,
    'profile.cacheRead': true,
    'profile.cacheReadList': true,
};

const streamsMatch: { [N in DataStreamName]: StreamMatches<N> } = {
    'channel.observeList': true,
    'channel.observeItem': true,
    'join.observeList': true,
    'chat.observeList': true,
    'chat.observeLastList': true,
    'chat.observeFeedCoverage': true,
    'cloud.observeItem': true,
    'place.observeList': true,
    'place.observeItem': true,
    'user.observeList': true,
    'profile.observeList': true,
    'profile.observeItem': true,
};

type UploadOf<T> = Exclude<NonNullable<T>[number & keyof NonNullable<T>], { localStatus: unknown }>;
type PendingOf<T> = Extract<NonNullable<T>[number & keyof NonNullable<T>], { localStatus: unknown }>;
type BlockOf<K extends CloudChatBlock['type']> = Extract<NonNullable<CacheChatView['blocks$']>[number], { type: K }>;

// The rows, named one by one (the methods above reach them too), the message's union members, and the session.
const rowsMatch: true[] = [
    true satisfies Same<CloudChannel, CacheChannelView>,
    true satisfies Same<CloudJoin, CacheJoinView>,
    true satisfies Same<CloudChat, CacheChatView>,
    true satisfies Same<CloudPlace, CacheSiteView>,
    true satisfies Same<CloudUser, CacheUserView>,
    true satisfies Same<CloudProfile, CacheProfileView>,
    true satisfies Same<CloudInfo, CacheCloudView>,
    true satisfies Same<CloudUpload, UploadOf<CacheChatView['upload$$']>>,
    true satisfies Same<CloudPendingUpload, PendingOf<CacheChatView['upload$$']>>,
    true satisfies Same<Extract<CloudChatBlock, { type: 'header' }>, BlockOf<'header'>>,
    true satisfies Same<Extract<CloudChatBlock, { type: 'section' }>, BlockOf<'section'>>,
    true satisfies Same<Extract<CloudChatBlock, { type: 'divider' }>, BlockOf<'divider'>>,
    true satisfies Same<Extract<CloudChatBlock, { type: 'context' }>, BlockOf<'context'>>,
    true satisfies Same<CloudSession, ReturnType<typeof sessionForPage>>,
];

// Keyed by every method the library types, with the permission it says opens it: compared below with
// what the whitelist opens, permission by permission.
const LIBRARY_CALLS: { [N in DataCallName]: DataCalls[N]['permission'] } = {
    'channel.cacheRead': 'channel',
    'channel.cacheReadList': 'channel',
    'channel.fetchList': 'channel',
    'join.cacheReadList': 'channel',
    'chat.cacheRead': 'chat',
    'chat.cacheReadList': 'chat',
    'chat.listPendingImageChats': 'chat',
    'chat.sendChat': 'chatSend',
    'cloud.cacheRead': 'cloud',
    'cloud.getCloud': 'cloud',
    'place.cacheReadList': 'place',
    'place.isPlaceDeleted': 'place',
    'user.cacheReadList': 'user',
    'user.listPlaceMembers': 'user',
    'profile.cacheRead': 'user',
    'profile.cacheReadList': 'user',
};
const LIBRARY_STREAMS: { [N in DataStreamName]: DataStreams[N]['permission'] } = {
    'channel.observeList': 'channel',
    'channel.observeItem': 'channel',
    'join.observeList': 'channel',
    'chat.observeList': 'chat',
    'chat.observeLastList': 'chat',
    'chat.observeFeedCoverage': 'chat',
    'cloud.observeItem': 'cloud',
    'place.observeList': 'place',
    'place.observeItem': 'place',
    'user.observeList': 'user',
    'profile.observeList': 'user',
    'profile.observeItem': 'user',
};

// Keyed by every runtime permission, so one the app adds fails to compile until it is listed here.
const PERMISSIONS = Object.keys({
    session: true,
    cloud: true,
    place: true,
    channel: true,
    chat: true,
    user: true,
    chatSend: true,
} satisfies Record<SubWebViewRuntimePermission, true>) as SubWebViewRuntimePermission[];

const byPermission = (table: Record<string, string>, permission: string) =>
    Object.keys(table)
        .filter(method => table[method] === permission)
        .sort();

describe("chatic-apps-sdk's typed runtime against the app's", () => {
    it.each(PERMISSIONS)('types exactly what the whitelist opens with `%s`', permission => {
        const opened = subWebViewAllowedFor(new Set([permission]));
        expect({
            calls: byPermission(LIBRARY_CALLS, permission),
            streams: byPermission(LIBRARY_STREAMS, permission),
        }).toEqual(opened);
    });

    it('declares the rows, arguments, answers and session as the app has them', () => {
        expect([...Object.values(callsMatch), ...Object.values(streamsMatch), ...rowsMatch].every(Boolean)).toBe(true);
    });

    it('compiles: every check in this file holds', () => {
        const configPath = path.resolve(__dirname, '../../../tsconfig.spec.json');
        const config = ts.getParsedCommandLineOfConfigFile(
            configPath,
            {},
            { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => undefined }
        );
        if (!config) throw new Error(`cannot read ${configPath}`);
        // Not as a project: only this file is checked, with whatever it imports.
        const program = ts.createProgram([__filename], {
            ...config.options,
            composite: false,
            noEmit: true,
            skipLibCheck: true,
        });
        const file = program.getSourceFile(__filename);
        const errors = [...program.getSyntacticDiagnostics(file), ...program.getSemanticDiagnostics(file)].map(
            diagnostic => {
                const at =
                    diagnostic.start === undefined
                        ? ''
                        : `:${(file?.getLineAndCharacterOfPosition(diagnostic.start).line ?? 0) + 1}`;
                return `${path.basename(__filename)}${at} ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`;
            }
        );

        expect(errors).toEqual([]);
    }, 120_000);
});

// ---------------------------------------------------------------------------------------------------
// The reference mini-app against this app's page host.
//
// The page in `apps/chatic-apps-example`, built from its sources as a production build would be, runs
// in a window of its own and talks to the real page host — the base handlers and the runtime bridge
// together, as `SubWebView` puts them — from the handshake to `finish`. Only the device and the
// runtime's engine are stand-ins. A request the library renames, or a handler the host drops, breaks
// what the page shows here before a page on a phone finds it.
// ---------------------------------------------------------------------------------------------------

const EXAMPLE = path.resolve(__dirname, '../../../../chatic-apps-example');

const hostedExample = async () => {
    const cloud = { id: 'cloud-example', cid: 'cloud-example', name: 'Example Cloud' };
    const rooms = [
        { id: 'room-lobby', cid: 'cloud-example', sid: 'place-example', isNotificationEnabled: true, name: 'Lobby' },
        { id: 'room-notes', cid: 'cloud-example', sid: 'place-example', isNotificationEnabled: true, name: 'Notes' },
    ];
    const profiles = [
        {
            id: 'place-example@user-me',
            cid: 'cloud-example',
            sid: 'place-example',
            uid: 'user-me',
            userId: 'user-me',
            updatedAtMs: 1,
            nick: 'Example Me',
        },
        {
            id: 'place-example@user-two',
            cid: 'cloud-example',
            sid: 'place-example',
            uid: 'user-two',
            userId: 'user-two',
            updatedAtMs: 1,
            nick: 'Member Two',
        },
    ];
    const stopRooms = jest.fn();
    const observeRooms = jest.fn((_query: unknown, listener: (result: unknown) => void) => {
        listener({ list: rooms, meta: { total: rooms.length } });
        return stopRooms;
    });
    const sendChat = jest.fn(async (input: { channelId: string; content: string }) => ({
        id: 'chat-sent',
        cid: 'cloud-example',
        channelId: input.channelId,
        chatNo: 9,
        isPending: false,
        isFailed: false,
        createdAtMs: 1,
        updatedAtMs: 1,
        content: input.content,
    }));
    const engine = {
        session: {
            snapshot: () => ({
                context: {
                    cloud: { cloudId: 'cloud-example', siteId: 'place-example', isActive: true },
                    identity: { userId: 'user-me', isAuthenticated: true },
                },
                committedSiteId: 'place-example',
            }),
            subscribe: () => () => undefined,
            onLogout: () => () => undefined,
        },
        data: {
            repositories: () => ({
                cloud: { getCloud: async () => cloud },
                place: {
                    cacheReadList: async () => ({
                        list: [{ id: 'place-example', cid: 'cloud-example', order: 0, name: 'Example Place' }],
                        meta: { total: 1 },
                    }),
                },
                channel: {
                    cacheRead: async (id: string) => rooms.find(room => room.id === id) ?? null,
                    observeList: observeRooms,
                },
                chat: {
                    sendChat,
                    cacheReadList: async (query: { channelId: string }) => ({
                        list: [
                            {
                                id: 'chat-1',
                                cid: 'cloud-example',
                                channelId: query.channelId,
                                chatNo: 1,
                                content: 'First message',
                            },
                        ],
                        meta: { total: 1 },
                    }),
                },
                profile: {
                    cacheRead: async (id: string) => profiles.find(profile => profile.id === id) ?? null,
                    cacheReadList: async (query: { sid?: string }) => ({
                        list: profiles.filter(profile => profile.sid === query.sid),
                        meta: { total: 2 },
                    }),
                    observeItem: (id: string, listener: (profile: unknown) => void) => {
                        listener(profiles.find(profile => profile.id === id) ?? null);
                        return () => undefined;
                    },
                },
            }),
        },
    } as unknown as RuntimeEngine;

    const storage = new SubWebViewStorage(memoryStorageFile());
    const service = new SubWebViewService({ warn: jest.fn(), error: jest.fn() } as never, () => 'view-1');
    service.open({ url: 'https://example.apps.chatic.io/' });
    const deps = {
        viewId: 'view-1',
        service,
        clipboard: { setText: jest.fn(async () => undefined) },
        haptic: { trigger: jest.fn(() => true) },
        openExternal: jest.fn(async () => undefined),
        setTitle: jest.fn(),
        openShareSheet: jest.fn(async () => ({ action: 'sharedAction' as const, activityType: null })),
        origin: 'https://example.apps.chatic.io',
        getDeviceId: () => 'device-1',
        setBackClaim: jest.fn(),
        setCloseGuard: jest.fn(),
        logPageError: jest.fn(),
        openStorage: () => storage,
        permissions: {
            status: jest.fn(async () => 'DENIED' as const),
            request: jest.fn(async () => 'GRANTED' as const),
        },
        openSettings: jest.fn(async () => true),
    };

    let page: OpenedPage | null = null;
    let host: ReturnType<typeof createSubBridgeHost> | null = null;
    const runtime = createSubWebViewRuntimeBridge({
        createHost: send => createRuntimeBridgeHost({ engine: async () => engine, send }),
        session: engine.session,
        openedCloudId: 'cloud-example',
        openedPlaceId: 'place-example',
        granted: new Set(['session', 'cloud', 'place', 'channel', 'chat', 'user', 'chatSend']),
        origin: 'https://example.apps.chatic.io',
        pageHost: () => host,
        consent: { ensure: async () => 'allowed' },
        budget: { take: () => ({ ok: true }) },
        sends: { take: () => ({ ok: true }) },
    });
    host = createSubBridgeHost(
        // Asynchronous, as the WebView is.
        message =>
            queueMicrotask(() =>
                page?.window.dispatchEvent(new page.window.MessageEvent('message', { data: message }))
            ),
        {
            ...permittedSubBridgeHandlers(
                createSubBridgeHandlers(deps),
                new Set(['clipboard', 'share', 'openUrl', 'userKey'])
            ),
            ...runtime.handlers,
        },
        () => ({
            protocolVersion: 1,
            viewId: 'view-1',
            platform: 'android',
            appVersion: '0.31.0',
            locale: 'en',
            theme: 'light',
            params: {},
            appLink: 'https://app.chatic.io/apps/example',
        })
    );

    const source = await loadEntry({
        html: fs.readFileSync(path.join(EXAMPLE, 'index.html'), 'utf8'),
        entry: path.join(EXAMPLE, 'src/main.ts'),
    });
    page = openPage(source, {
        url: 'https://example.apps.chatic.io/',
        beforeScripts: window => {
            Object.assign(window, {
                ReactNativeWebView: { postMessage: (message: string) => void host?.handleMessage(message) },
            });
        },
    });
    const opened = page;
    const document = opened.window.document;
    const text = (field: string) => document.querySelector(`[data-field="${field}"]`)?.textContent ?? '';
    /** Waits until `ready` holds, as the page answers at its own pace. */
    const until = async (ready: () => boolean, what: string) => {
        for (let waited = 0; waited < 3000; waited += 10) {
            if (ready()) return;
            await pageSettle(10);
        }
        throw new Error(`The page never got to: ${what}. It shows: ${document.body.textContent}`);
    };
    const tap = async (action: string) => {
        const element = document.querySelector(`[data-action="${action}"]`) as HTMLElement | null;
        if (!element) throw new Error(`No ${action} on the page. It shows: ${document.body.textContent}`);
        element.click();
        await pageSettle(20);
    };
    const back = async () => {
        host?.pushEvent({ type: 'OnBackPressed', success: true, data: {} });
        await pageSettle(20);
    };
    return {
        page: opened,
        document,
        deps,
        service,
        storage,
        runtime,
        sendChat,
        observeRooms,
        stopRooms,
        text,
        until,
        tap,
        back,
    };
};

describe('the reference mini-app against the page host', () => {
    it('talks to the host from the handshake to finish', async () => {
        const app = await hostedExample();
        try {
            await app.until(() => app.document.querySelector('[data-action="rooms"]') !== null, 'the cloud read');
            expect(app.deps.setTitle).toHaveBeenCalledWith('Example Cloud');
            expect(app.text('place')).toBe('Place: Example Place');

            await app.tap('count');
            await app.tap('copy');
            await app.tap('share');
            await app.tap('user-key');
            await app.until(() => /^Key: [0-9a-f]{8}…$/.test(app.text('notice')), 'the user key');
            await app.tap('camera');
            await app.until(() => app.text('notice') === 'Camera: granted', 'the camera');
            expect(app.deps.haptic.trigger).toHaveBeenCalledWith('selection');
            expect(app.deps.clipboard.setText).toHaveBeenCalledWith('https://app.chatic.io/apps/example?from=example');
            expect(app.deps.openShareSheet).toHaveBeenCalledWith(
                expect.objectContaining({ url: 'https://app.chatic.io/apps/example?count=1' })
            );
            expect(app.deps.permissions.request).toHaveBeenCalledWith('CAMERA');
            await app.until(() => app.storage.get(['count']).ok, 'the count saved');

            // A room: a stream to open and stop, a list to read, a message to send, back taken and given back.
            await app.tap('rooms');
            await app.until(() => app.text('room-total') === '2 rooms', 'the rooms');
            expect(app.deps.setBackClaim).toHaveBeenLastCalledWith(true);
            await app.tap('room');
            await app.until(() => app.text('messages') === 'First message', 'the messages');
            const draft = app.document.querySelector('[data-field="draft"]') as HTMLInputElement;
            draft.value = 'Hello from the example';
            draft.dispatchEvent(new app.page.window.Event('input'));
            await app.until(() => app.deps.setCloseGuard.mock.calls.at(-1)?.[0] === true, 'the close guard');
            await app.tap('send');
            await app.until(() => app.text('notice') === 'Sent.', 'the send');
            expect(app.sendChat).toHaveBeenCalledWith({ channelId: 'room-lobby', content: 'Hello from the example' });
            expect(app.deps.setCloseGuard).toHaveBeenLastCalledWith(false);
            await app.back();
            await app.back();
            // The rooms screen opens its stream each time it shows, and stops it each time it leaves.
            await app.until(
                () => app.stopRooms.mock.calls.length === app.observeRooms.mock.calls.length,
                'every rooms stream stopped'
            );
            expect(app.observeRooms).toHaveBeenCalledWith({ sid: 'place-example' }, expect.any(Function));
            expect(app.deps.setBackClaim).toHaveBeenLastCalledWith(false);

            // Members: the place's profiles, the user's own, one followed.
            await app.tap('members');
            await app.until(() => app.text('me') === 'You: Example Me', 'my profile');
            await app.until(() => app.text('members').includes('Member Two'), 'the members');
            await app.tap('member');
            await app.until(() => app.text('member') === 'Example Me', 'the member picked');
            await app.back();

            const closed: unknown[] = [];
            app.service.subscribe(event => closed.push(event));
            await app.tap('done');
            await app.until(() => closed.length > 0, 'finish');
            expect(closed).toEqual([expect.objectContaining({ type: 'closed', reason: 'page', result: { count: 1 } })]);
            expect(app.deps.logPageError).not.toHaveBeenCalled();
            expect(app.page.errors).toEqual([]);
        } finally {
            app.page.close();
            app.runtime.dispose();
        }
    }, 60_000);
});
