/**
 * @jest-environment node
 */
// Node, not jsdom: the runtime's socket client needs `TextEncoder`, which jsdom leaves out.
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
import {
    connectOver,
    isOneReactionCharacter as libraryReactionRule,
    type Transport,
} from '@chatic/chatic-apps-sdk/internal';
import {
    RUNTIME_CONTRACTS,
    createRuntimeBridgeHost,
    subWebViewAllowedFor,
    type RuntimeEngine,
} from '@chatic/runtime-mobile';

import { createSubBridgeHost } from './createSubBridgeHost';
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
    const setReaction = jest.fn(async (input: { chatId: string }) => ({
        id: input.chatId,
        cid: 'c1',
        channelId: 'ch1',
        chatNo: 1,
        isPending: false,
        isFailed: false,
        createdAtMs: 1,
        updatedAtMs: 1,
    }));
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
                chat: {
                    sendChat,
                    setReaction,
                    cacheRead: async (id: string) =>
                        id === 'm1' ? { id: 'm1', cid: 'c1', channelId: 'ch1', chatNo: 1 } : null,
                },
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
        reactions: { take: () => ({ ok: true }) },
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
        setReaction,
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
    'chat.setReaction': true,
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
    'chat.setReaction': 'chatReact',
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
// `false` marks one the app opens before the library types it; turn it to `true` once the library's
// typed methods cover it, and this test holds the two equal again. Every one is typed today.
const TYPED_BY_THE_LIBRARY = {
    session: true,
    cloud: true,
    place: true,
    channel: true,
    chat: true,
    user: true,
    chatSend: true,
    chatReact: true,
} satisfies Record<SubWebViewRuntimePermission, boolean>;
const PERMISSIONS = (Object.keys(TYPED_BY_THE_LIBRARY) as SubWebViewRuntimePermission[]).filter(
    permission => TYPED_BY_THE_LIBRARY[permission]
);

const byPermission = (table: Record<string, string>, permission: string) =>
    Object.keys(table)
        .filter(method => table[method] === permission)
        .sort();

describe("chatic-apps-sdk's typed runtime against the app's", () => {
    it.each([
        '👍',
        '👍🏽',
        '👨‍👩‍👧',
        '🇰🇷',
        '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
        '#️⃣',
        '1⃣',
        '❤️',
        'é',
        'a\u0301\u0302',
        'a\u0301\u0302\u0303',
        'ok',
        '👍👍',
        ' ',
        '\u200b',
        '\ue000',
        '\u1100\u1161',
        'x'.repeat(17),
        '\u200d👍',
    ])("refuses a reaction of %j exactly when the mock's copy of the rule does", async sample => {
        const { transport } = setup({ granted: ['chatReact'] });
        const apps = await connectOver(transport, { reportErrors: false });
        const answer = await apps.data.react('m1', sample, true).then(
            () => 'set',
            (error: ChaticAppsError) => error.code
        );
        expect(answer).toBe(libraryReactionRule(sample) ? 'set' : 'RUNTIME_NOT_ALLOWED');
        apps.disconnect();
    });

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
