/**
 * @jest-environment node
 */
// Node, not jsdom: the runtime's socket client needs `TextEncoder`, which jsdom leaves out.
import type { SubWebViewRuntimePermission } from '@chatic/bridge-messages';
import type { IAppBridgeHost } from '@chatic/bridges';
import { RUNTIME_CONTRACTS, createRuntimeBridgeHost } from '@chatic/runtime-mobile';
import type { RuntimeEngine } from '@chatic/runtime-mobile';

import { pushedEventErrors, pushedEvents } from '../webview/hooks/appEventContract';
import { createSubWebViewRuntimeBridge, sessionForPage, SUB_WEBVIEW_STREAMS_PER_LOAD } from './subWebViewRuntimeBridge';
import type { SubWebViewReadBudget } from './subWebViewReadBudget';
import type { SubWebViewRuntimeConsent } from './subWebViewRuntimeConsent';

// The runtime package reads these at import; nothing here reaches them.
jest.mock('react-native', () => ({
    AppState: { currentState: 'active', addEventListener: jest.fn() },
    Platform: { OS: 'ios' },
}));
jest.mock('@react-native-community/netinfo', () => ({ addEventListener: jest.fn(), fetch: jest.fn() }));

/** An engine with just what these requests reach: the session, two repositories, the session commands. */
const fakeEngine = () => {
    let cloudId: string | null = 'c1';
    let placeId = 's1';
    const sessionListeners = new Set<() => void>();
    const channelListeners = new Set<(result: unknown) => void>();
    const snapshot = () => ({
        context: {
            cloud: { cloudId, siteId: 's1', isActive: true, backend: 'https://c1.example', wss: 'wss://c1.example' },
            identity: { userId: 'u1', isAuthenticated: true, delegatorId: 'guest-device' },
            relay: { siteId: '0000' },
        },
        committedSiteId: placeId,
        uidByCloud: { c1: 'u1', c9: 'u9' },
        auth: { isAuthenticated: true },
    });
    // The rooms this device holds: one in the session's place, one in another place of the cloud.
    const rooms: Record<string, { id: string; cid: string; sid: string }> = {
        ch1: { id: 'ch1', cid: 'c1', sid: 's1' },
        ch2: { id: 'ch2', cid: 'c1', sid: 's2' },
    };
    // Messages this device holds: one in each of those rooms.
    const messages: Record<string, { id: string; channelId: string; chatNo?: number } & Record<string, unknown>> = {
        m1: { id: 'm1', channelId: 'ch1', chatNo: 1 },
        m2: { id: 'm2', channelId: 'ch2', chatNo: 2 },
        // Rows of the same room a reaction cannot be set on.
        mDeleted: { id: 'mDeleted', channelId: 'ch1', chatNo: 3, hidden: true },
        mSending: { id: 'mSending', channelId: 'ch1', chatNo: 0, isPending: true },
        mReaction: { id: 'mReaction', channelId: 'ch1', chatNo: 4, subType: 'reaction' },
    };
    const repositories = {
        channel: {
            cacheRead: jest.fn(async (id: string) => rooms[id] ?? null),
            cacheReadList: jest.fn(async () => ({ list: [{ id: 'ch1', name: 'General', memberIds: ['u1'] }] })),
            fetchList: jest.fn(async () => ({ list: [] })),
            observeList: jest.fn((_query: unknown, listener: (result: unknown) => void) => {
                channelListeners.add(listener);
                return () => channelListeners.delete(listener);
            }),
        },
        chat: {
            sendChat: jest.fn(async (payload: { channelId: string; content: string }) => ({ id: 'm9', ...payload })),
            setReaction: jest.fn(async (payload: { chatId: string; emoji: string; action: string }) => ({
                ...messages[payload.chatId],
                reactions: { [payload.emoji]: payload.action === 'on' ? 1 : 0 },
            })),
            cacheRead: jest.fn(async (id: string) => messages[id] ?? null),
            cacheReadList: jest.fn(async () => ({ list: [] })),
        },
    };
    const engine = {
        session: {
            snapshot,
            subscribe: (listener: () => void) => {
                sessionListeners.add(listener);
                return () => sessionListeners.delete(listener);
            },
            onLogout: () => () => undefined,
        },
        commands: { switchSite: jest.fn(async () => undefined) },
        data: { repositories: () => repositories },
    } as unknown as RuntimeEngine;
    return {
        engine,
        repositories,
        commands: (engine as unknown as { commands: { switchSite: jest.Mock } }).commands,
        sessionListeners,
        emitChannels: (result: unknown) => channelListeners.forEach(listener => listener(result)),
        channelListenerCount: () => channelListeners.size,
        moveTo: (next: string | null) => {
            cloudId = next;
            sessionListeners.forEach(listener => listener());
        },
        moveToPlace: (next: string) => {
            placeId = next;
            sessionListeners.forEach(listener => listener());
        },
    };
};

const allow: SubWebViewRuntimeConsent = { ensure: jest.fn(async () => 'allowed' as const) };
const plenty: SubWebViewReadBudget = { take: () => ({ ok: true }) };

const build = ({
    granted = ['channel'],
    consent = allow,
    budget = plenty,
    sends = plenty,
    reactions = plenty,
}: {
    granted?: SubWebViewRuntimePermission[];
    consent?: SubWebViewRuntimeConsent;
    budget?: SubWebViewReadBudget;
    sends?: SubWebViewReadBudget;
    reactions?: SubWebViewReadBudget;
} = {}) => {
    const fake = fakeEngine();
    const bridge = { pushEvent: jest.fn() } as unknown as IAppBridgeHost & { pushEvent: jest.Mock };
    let current = true;
    const onRefused = jest.fn();
    const runtime = createSubWebViewRuntimeBridge({
        createHost: send => createRuntimeBridgeHost({ engine: async () => fake.engine, send }),
        session: fake.engine.session,
        openedCloudId: 'c1',
        openedPlaceId: 's1',
        granted: new Set(granted),
        origin: 'https://quiz.apps.chatic.io',
        pageHost: () => (current ? bridge : null),
        consent,
        budget,
        sends,
        reactions,
        onRefused,
    });
    const hello = () =>
        runtime.handlers.RuntimeHello({ type: 'RuntimeHello', data: { contracts: [...RUNTIME_CONTRACTS] } } as never);
    const call = (target: string, method: string, args: unknown[] = []) =>
        runtime.handlers.RuntimeCall({ type: 'RuntimeCall', data: { target, method, args } } as never);
    const subscribe = (subscriptionId: string, topic: string, args: unknown[]) =>
        runtime.handlers.RuntimeSubscribe({
            type: 'RuntimeSubscribe',
            data: { subscriptionId, target: 'data', topic, args },
        } as never);
    return { ...fake, bridge, runtime, onRefused, hello, call, subscribe, endLoad: () => (current = false) };
};

const flush = () => new Promise(resolve => setImmediate(resolve));

describe('createSubWebViewRuntimeBridge', () => {
    it('answers the hello with the contract and what this page may use, and no session without `session`', async () => {
        const { hello } = build({ granted: ['channel'] });

        await expect(hello()).resolves.toEqual({
            type: 'OnRuntimeHello',
            success: true,
            data: {
                sessionOwner: 'native',
                contract: RUNTIME_CONTRACTS[0],
                seq: 0,
                session: null,
                allowed: {
                    calls: ['channel.cacheRead', 'channel.cacheReadList', 'channel.fetchList', 'join.cacheReadList'],
                    streams: ['channel.observeItem', 'channel.observeList', 'join.observeList'],
                },
            },
        });
    });

    it("hands over the current cloud's part of the session with `session`, and its changes", async () => {
        const { hello, bridge, sessionListeners } = build({ granted: ['session'] });
        const forPage = {
            context: {
                cloud: { cloudId: 'c1', siteId: 's1', isActive: true },
                identity: { userId: 'u1', isAuthenticated: true },
            },
            committedSiteId: 's1',
        };

        const answer = await hello();
        // Not the account's other clouds, the relay, the guest id, or the cloud's server addresses.
        expect((answer as { data: { session: unknown } }).data.session).toEqual(forPage);

        sessionListeners.forEach(listener => listener());
        await flush();
        expect(bridge.pushEvent).toHaveBeenCalledWith({
            type: 'OnRuntimeSessionChanged',
            success: true,
            data: expect.objectContaining({ session: forPage }),
        });
    });

    it('pushes no session change without `session`', async () => {
        const { hello, bridge, sessionListeners } = build({ granted: ['channel'] });
        await hello();

        sessionListeners.forEach(listener => listener());
        await flush();

        expect(bridge.pushEvent).not.toHaveBeenCalled();
    });

    it('answers a hello the user did not allow with CONSENT_REFUSED', async () => {
        const { hello } = build({ consent: { ensure: async () => 'refused' } });

        await expect(hello()).resolves.toMatchObject({
            type: 'OnRuntimeHello',
            success: false,
            error: { code: 'CONSENT_REFUSED' },
        });
    });

    it('pushes nothing once its page load is over', async () => {
        const { hello, subscribe, bridge, emitChannels, endLoad } = build();
        await hello();
        await subscribe('s1', 'channel.observeList', [{ sid: 's1' }, { $listener: true }]);

        endLoad();
        emitChannels({ list: [{ id: 'ch1' }] });

        expect(bridge.pushEvent).not.toHaveBeenCalled();
    });

    it('holds subscribes still waiting for consent to the stream cap', async () => {
        let answer: () => void = () => undefined;
        const asked = new Promise<void>(resolve => (answer = resolve));
        const { hello, subscribe } = build({
            consent: {
                ensure: jest
                    .fn()
                    .mockResolvedValueOnce('allowed')
                    .mockImplementation(() => asked.then(() => 'allowed')),
            },
        });
        await hello();

        const burst = Array.from({ length: SUB_WEBVIEW_STREAMS_PER_LOAD + 4 }, (_, i) =>
            subscribe(`b${i}`, 'channel.observeList', [{ sid: 's1' }, { $listener: true }])
        );
        answer();
        const results = await Promise.all(burst);

        expect(results.filter(result => result.success)).toHaveLength(SUB_WEBVIEW_STREAMS_PER_LOAD);
        expect(results.filter(result => !result.success)).toHaveLength(4);
    });

    it('keeps the stream a refused replacement would have replaced', async () => {
        const { hello, subscribe, bridge, emitChannels } = build();
        await hello();
        await subscribe('s1', 'channel.observeList', [{ sid: 's1' }, { $listener: true }]);

        // Two listener markers: the runtime refuses it before it touches the stream under `s1`.
        await expect(
            subscribe('s1', 'channel.observeList', [{ $listener: true }, { $listener: true }])
        ).resolves.toMatchObject({ success: false });
        emitChannels({ list: [] });

        expect(bridge.pushEvent).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'OnRuntimeEvent', data: expect.objectContaining({ subscriptionId: 's1' }) })
        );
    });

    it('passes an allowed read through and answers what the runtime answered, unchanged', async () => {
        const { hello, call, repositories } = build();
        await hello();

        await expect(call('data', 'channel.cacheReadList', [{ sid: 's1' }])).resolves.toEqual({
            type: 'OnRuntimeCall',
            success: true,
            data: { value: { list: [{ id: 'ch1', name: 'General', memberIds: ['u1'] }] } },
        });
        expect(repositories.channel.cacheReadList).toHaveBeenCalledWith({ sid: 's1' });
    });

    it('refuses a write before the runtime sees it, with the reason', async () => {
        const { hello, call, repositories, onRefused } = build({ granted: ['chat'] });
        await hello();

        await expect(call('data', 'chat.deleteChat', [{ id: 'm1' }])).resolves.toMatchObject({
            type: 'OnRuntimeCall',
            success: false,
            error: {
                code: 'RUNTIME_NOT_ALLOWED',
                details: { target: 'data', method: 'chat.deleteChat', reason: 'write' },
            },
        });
        expect(onRefused).toHaveBeenCalledWith(expect.objectContaining({ method: 'chat.deleteChat', reason: 'write' }));
    });

    describe('a reaction', () => {
        const react = (call: (t: string, m: string, a?: unknown[]) => Promise<unknown>, payload: object) =>
            call('data', 'chat.setReaction', [payload]);

        it('sets one on a message of a room of the place with chatReact, and answers the message', async () => {
            const { hello, call, repositories } = build({ granted: ['chatReact'] });
            await hello();

            await expect(react(call, { chatId: 'm1', emoji: '👍', action: 'on' })).resolves.toEqual({
                type: 'OnRuntimeCall',
                success: true,
                data: { value: { id: 'm1', channelId: 'ch1', chatNo: 1, reactions: { '👍': 1 } } },
            });
            await expect(react(call, { chatId: 'm1', emoji: '👍', action: 'off' })).resolves.toMatchObject({
                success: true,
            });
            expect(repositories.chat.setReaction).toHaveBeenCalledTimes(2);
        });

        it.each([
            ['of a room in another place', 'm2'],
            ['the device does not hold', 'm404'],
            ['that was deleted', 'mDeleted'],
            ['still sending', 'mSending'],
            ['that records a reaction itself', 'mReaction'],
        ])('refuses one on a message %s, before it is set', async (_case, chatId) => {
            const { hello, call, repositories } = build({ granted: ['chatReact'] });
            await hello();

            await expect(react(call, { chatId, emoji: '👍', action: 'on' })).resolves.toMatchObject({
                success: false,
                error: { code: 'RUNTIME_NOT_ALLOWED', details: { method: 'chat.setReaction', reason: 'guard' } },
            });
            expect(repositories.chat.setReaction).not.toHaveBeenCalled();
        });

        it('refuses every reaction once the user moved to another place', async () => {
            const { hello, call, moveToPlace, repositories } = build({ granted: ['chatReact'] });
            await hello();
            moveToPlace('s2');

            await expect(react(call, { chatId: 'm1', emoji: '👍', action: 'on' })).resolves.toMatchObject({
                success: false,
                error: { code: 'RUNTIME_NOT_ALLOWED' },
            });
            expect(repositories.chat.setReaction).not.toHaveBeenCalled();
        });

        it('refuses a page without chatReact, whatever else it may do', async () => {
            const { hello, call, repositories } = build({
                granted: ['session', 'cloud', 'place', 'channel', 'chat', 'user', 'chatSend'],
            });
            await hello();

            await expect(react(call, { chatId: 'm1', emoji: '👍', action: 'on' })).resolves.toMatchObject({
                success: false,
                error: { code: 'RUNTIME_NOT_ALLOWED', details: { reason: 'notGranted' } },
            });
            expect(repositories.chat.setReaction).not.toHaveBeenCalled();
        });

        it('refuses a long emoji, as a guard, before anything is read', async () => {
            const { hello, call, repositories } = build({ granted: ['chatReact'] });
            await hello();

            await expect(react(call, { chatId: 'm1', emoji: '👍 nice', action: 'on' })).resolves.toMatchObject({
                success: false,
                error: { code: 'RUNTIME_NOT_ALLOWED', details: { reason: 'guard' } },
            });
            expect(repositories.chat.cacheRead).not.toHaveBeenCalled();
        });

        it('spends its budget on every attempt, a refused one included, so the cache cannot be probed', async () => {
            const take = jest.fn(() => ({ ok: true as const }));
            const { hello, call } = build({ granted: ['chatReact'], reactions: { take } });
            await hello();

            await react(call, { chatId: 'm404', emoji: '👍', action: 'on' });
            await react(call, { chatId: 'm1', emoji: '👍', action: 'on' });

            expect(take).toHaveBeenCalledTimes(2);
        });

        it('asks consent per place, and spends a budget of its own, apart from the messages', async () => {
            const ensure = jest.fn(async () => 'allowed' as const);
            const reacted = jest.fn(() => ({ ok: false as const, retryAfterMs: 75 }));
            const sent = jest.fn(() => ({ ok: true as const }));
            const { hello, call } = build({
                granted: ['chatReact'],
                consent: { ensure },
                reactions: { take: reacted },
                sends: { take: sent },
            });
            await hello();

            await expect(react(call, { chatId: 'm1', emoji: '👍', action: 'on' })).resolves.toMatchObject({
                success: false,
                error: { code: 'RATE_LIMITED', details: { retryAfterMs: 75 } },
            });
            expect(reacted).toHaveBeenCalledTimes(1);
            expect(sent).not.toHaveBeenCalled();
            expect(ensure).toHaveBeenCalledWith(expect.objectContaining({ placeId: 's1' }), new Set(['chatReact']));
        });
    });

    it('sends a text message to a room of the place with chatSend, and answers the sent message', async () => {
        const { hello, call, repositories } = build({ granted: ['chatSend'] });
        await hello();

        await expect(call('data', 'chat.sendChat', [{ channelId: 'ch1', content: '3' }])).resolves.toEqual({
            type: 'OnRuntimeCall',
            success: true,
            data: { value: { id: 'm9', channelId: 'ch1', content: '3' } },
        });
        expect(repositories.chat.sendChat).toHaveBeenCalledWith({ channelId: 'ch1', content: '3' });
    });

    it.each([
        ['in another place of the cloud', 'ch2'],
        ['this device does not hold', 'ch404'],
    ])('refuses a message to a room %s, before it is sent', async (_case, room) => {
        const { hello, call, repositories, onRefused } = build({ granted: ['chatSend'] });
        await hello();

        await expect(call('data', 'chat.sendChat', [{ channelId: room, content: '3' }])).resolves.toMatchObject({
            success: false,
            error: { code: 'RUNTIME_NOT_ALLOWED', details: { method: 'chat.sendChat', reason: 'guard' } },
        });
        expect(repositories.chat.sendChat).not.toHaveBeenCalled();
        expect(onRefused).toHaveBeenCalledWith(expect.objectContaining({ method: 'chat.sendChat', reason: 'guard' }));
    });

    it('refuses a message without chatSend, whatever reads the page holds', async () => {
        const { hello, call, repositories } = build({ granted: ['channel', 'chat'] });
        await hello();

        await expect(call('data', 'chat.sendChat', [{ channelId: 'ch1', content: '3' }])).resolves.toMatchObject({
            error: { code: 'RUNTIME_NOT_ALLOWED', details: { reason: 'notGranted' } },
        });
        expect(repositories.chat.sendChat).not.toHaveBeenCalled();
    });

    it('refuses a message and every read of a place once the session left the place the view opened on', async () => {
        const { hello, call, repositories, moveToPlace } = build({ granted: ['chatSend', 'channel'] });
        await hello();
        moveToPlace('s2');

        await expect(call('data', 'chat.sendChat', [{ channelId: 'ch2', content: '3' }])).resolves.toMatchObject({
            error: { code: 'RUNTIME_NOT_ALLOWED', details: { reason: 'guard' } },
        });
        expect(repositories.chat.sendChat).not.toHaveBeenCalled();
        for (const sid of ['s1', 's2']) {
            await expect(call('data', 'channel.cacheReadList', [{ sid }])).resolves.toMatchObject({
                error: { code: 'RUNTIME_NOT_ALLOWED', details: { reason: 'guard' } },
            });
        }
        expect(repositories.channel.cacheReadList).not.toHaveBeenCalled();
    });

    it('reads a room, and what is in it, only in the place the view opened on', async () => {
        const { hello, call, repositories } = build({ granted: ['channel', 'chat'] });
        await hello();

        await expect(call('data', 'channel.cacheRead', ['ch1'])).resolves.toMatchObject({ success: true });
        await expect(call('data', 'chat.cacheReadList', [{ channelId: 'ch1' }])).resolves.toMatchObject({
            success: true,
        });
        expect(repositories.chat.cacheReadList).toHaveBeenCalledTimes(1);

        await expect(call('data', 'channel.cacheRead', ['ch2'])).resolves.toMatchObject({
            error: { code: 'RUNTIME_NOT_ALLOWED', details: { reason: 'guard' } },
        });
        await expect(call('data', 'chat.cacheReadList', [{ channelId: 'ch2' }])).resolves.toMatchObject({
            error: { code: 'RUNTIME_NOT_ALLOWED', details: { reason: 'guard' } },
        });
        await expect(call('data', 'chat.cacheReadList', [{ channelId: 'unknown' }])).resolves.toMatchObject({
            error: { code: 'RUNTIME_NOT_ALLOWED', details: { reason: 'guard' } },
        });
        expect(repositories.chat.cacheReadList).toHaveBeenCalledTimes(1);
    });

    it('answers a message by its id only when its room is of the place, and null as it is', async () => {
        const { hello, call } = build({ granted: ['chat'] });
        await hello();

        await expect(call('data', 'chat.cacheRead', ['m1'])).resolves.toMatchObject({
            success: true,
            data: { value: { id: 'm1' } },
        });
        await expect(call('data', 'chat.cacheRead', ['m2'])).resolves.toMatchObject({
            error: { code: 'RUNTIME_NOT_ALLOWED', details: { reason: 'guard' } },
        });
        await expect(call('data', 'chat.cacheRead', ['nothing'])).resolves.toMatchObject({
            success: true,
            data: { value: null },
        });
    });

    it('asks every page per place, one that only reads as much as one that sends', async () => {
        const ensure = jest.fn(async () => 'allowed' as const);
        await build({ granted: ['chatSend'], consent: { ensure } }).hello();
        await build({ granted: ['chat'], consent: { ensure } }).hello();

        expect(ensure).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({ cloudId: 'c1', placeId: 's1' }),
            expect.anything()
        );
        expect(ensure).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({ cloudId: 'c1', placeId: 's1' }),
            expect.anything()
        );
    });

    it('sends nothing from a view that closed while the message waited on the user', async () => {
        let answer: (allowed: 'allowed') => void = () => undefined;
        const ensure = jest
            .fn()
            .mockResolvedValueOnce('allowed')
            .mockImplementationOnce(() => new Promise(resolve => (answer = resolve)));
        const { hello, call, runtime, repositories } = build({ granted: ['chatSend'], consent: { ensure } });
        await hello();
        // The hello was allowed; the message's own check then waits on a question still on screen.
        const sending = call('data', 'chat.sendChat', [{ channelId: 'ch1', content: '3' }]);
        await flush();
        runtime.dispose();
        answer('allowed');

        await expect(sending).resolves.toMatchObject({ success: false, error: { code: 'RUNTIME_NOT_STARTED' } });
        expect(repositories.chat.sendChat).not.toHaveBeenCalled();
    });

    it("answers the room read's own failure, not a guard", async () => {
        const { hello, call, repositories } = build({ granted: ['chatSend'] });
        await hello();
        repositories.channel.cacheRead.mockRejectedValueOnce(new Error('cache closed'));

        const answer = await call('data', 'chat.sendChat', [{ channelId: 'ch1', content: '3' }]);
        expect(answer).toMatchObject({ success: false });
        expect((answer as { error: { code: string } }).error.code).not.toBe('RUNTIME_NOT_ALLOWED');
        expect(repositories.chat.sendChat).not.toHaveBeenCalled();
    });

    it('spends the send budget on a message, apart from the read budget', async () => {
        const reads = jest.fn(() => ({ ok: true as const }));
        const sent = jest.fn(() => ({ ok: false as const, retryAfterMs: 300 }));
        const { hello, call, repositories } = build({
            granted: ['chatSend'],
            budget: { take: reads },
            sends: { take: sent },
        });
        await hello();

        await expect(call('data', 'chat.sendChat', [{ channelId: 'ch1', content: '3' }])).resolves.toMatchObject({
            success: false,
            error: { code: 'RATE_LIMITED', details: { retryAfterMs: 300 } },
        });
        expect(reads).not.toHaveBeenCalled();
        expect(sent).toHaveBeenCalledTimes(1);
        expect(repositories.chat.sendChat).not.toHaveBeenCalled();
    });

    it('refuses a place switch: the session commands are closed', async () => {
        const { hello, call, commands } = build({ granted: ['session', 'place'] });
        await hello();

        await expect(call('session', 'switchSite', ['s2'])).resolves.toMatchObject({
            success: false,
            error: { code: 'RUNTIME_NOT_ALLOWED', details: { reason: 'account' } },
        });
        expect(commands.switchSite).not.toHaveBeenCalled();
    });

    it('refuses an open method whose permission the page does not hold', async () => {
        const { hello, call, repositories } = build({ granted: ['channel'] });
        await hello();

        await expect(call('data', 'chat.cacheRead', ['m1'])).resolves.toMatchObject({
            error: { code: 'RUNTIME_NOT_ALLOWED', details: { reason: 'notGranted' } },
        });
        expect(repositories.chat.cacheRead).not.toHaveBeenCalled();
    });

    it("spends the view's budget on a server read only, and refuses one over it", async () => {
        const take = jest.fn(() => ({ ok: false as const, retryAfterMs: 120 }));
        const { hello, call, repositories } = build({ budget: { take } });
        await hello();

        await expect(call('data', 'channel.cacheReadList', [{ sid: 's1' }])).resolves.toMatchObject({ success: true });
        expect(take).not.toHaveBeenCalled();

        await expect(call('data', 'channel.fetchList', [{ sid: 's1' }])).resolves.toMatchObject({
            success: false,
            error: { code: 'RATE_LIMITED', details: { retryAfterMs: 120 } },
        });
        expect(repositories.channel.fetchList).not.toHaveBeenCalled();
    });

    it('answers a malformed request INVALID', async () => {
        const { hello, runtime } = build();
        await hello();

        await expect(
            runtime.handlers.RuntimeCall({ type: 'RuntimeCall', data: { target: 'data', method: '' } } as never)
        ).resolves.toMatchObject({ success: false, error: { code: 'INVALID' } });
    });

    it("pushes an open stream's events in the shape the vocabulary declares", async () => {
        const { hello, subscribe, bridge, emitChannels } = build();
        await hello();

        await expect(subscribe('s1', 'channel.observeList', [{ sid: 's1' }, { $listener: true }])).resolves.toEqual({
            type: 'OnRuntimeSubscribe',
            success: true,
            data: {},
        });
        emitChannels({ list: [{ id: 'ch1' }] });

        expect(bridge.pushEvent).toHaveBeenCalledWith({
            type: 'OnRuntimeEvent',
            success: true,
            data: { subscriptionId: 's1', seq: 1, event: [{ list: [{ id: 'ch1' }] }] },
        });
        expect(pushedEventErrors(pushedEvents(bridge.pushEvent))).toEqual([]);
    });

    it(`holds a page load to ${SUB_WEBVIEW_STREAMS_PER_LOAD} streams`, async () => {
        const { hello, subscribe } = build();
        await hello();

        for (let i = 0; i < SUB_WEBVIEW_STREAMS_PER_LOAD; i += 1) {
            await expect(
                subscribe(`s${i}`, 'channel.observeList', [{ sid: 's1' }, { $listener: true }])
            ).resolves.toMatchObject({
                success: true,
            });
        }
        await expect(
            subscribe('one-more', 'channel.observeList', [{ sid: 's1' }, { $listener: true }])
        ).resolves.toMatchObject({
            success: false,
            error: { code: 'INVALID' },
        });
        // The same id again replaces its stream rather than adding one.
        await expect(
            subscribe('s0', 'channel.observeList', [{ sid: 's1' }, { $listener: true }])
        ).resolves.toMatchObject({
            success: true,
        });
    });

    it('ends every open stream when the cloud changes, and answers nothing after', async () => {
        const { hello, subscribe, call, bridge, moveTo, emitChannels, channelListenerCount, repositories } = build();
        await hello();
        await subscribe('s1', 'channel.observeList', [{ sid: 's1' }, { $listener: true }]);
        emitChannels({ list: [] });
        bridge.pushEvent.mockClear();

        moveTo('c2');

        expect(bridge.pushEvent).toHaveBeenCalledWith({
            type: 'OnRuntimeEvent',
            success: true,
            data: {
                subscriptionId: 's1',
                seq: 2,
                event: { $ended: expect.objectContaining({ code: 'CLOUD_CHANGED' }) },
            },
        });
        expect(channelListenerCount()).toBe(0);

        bridge.pushEvent.mockClear();
        emitChannels({ list: [{ id: 'late' }] });
        expect(bridge.pushEvent).not.toHaveBeenCalled();

        // Moving back does not reopen it: the view was bound to the cloud it opened on, once.
        moveTo('c1');
        await expect(call('data', 'channel.cacheReadList', [{}])).resolves.toMatchObject({
            success: false,
            error: { code: 'CLOUD_CHANGED' },
        });
        expect(repositories.channel.cacheReadList).not.toHaveBeenCalled();
    });

    it('stops its streams and its session watch when disposed', async () => {
        const { hello, subscribe, runtime, sessionListeners, channelListenerCount } = build();
        await hello();
        await subscribe('s1', 'channel.observeList', [{ sid: 's1' }, { $listener: true }]);

        runtime.dispose();

        expect(channelListenerCount()).toBe(0);
        expect(sessionListeners.size).toBe(0);
    });
});

describe('sessionForPage', () => {
    const identity = { userId: 'u1', isAuthenticated: true, isInitialized: true, error: null, delegatorId: null };

    it("hands a page Home as the cloud `default` on the relay's place", () => {
        const home = {
            context: {
                cloud: { cloudId: null, siteId: null, backend: null, wss: null, isActive: false },
                relay: { backend: 'b', wss: 'w', siteId: '0000', isAuthenticated: true },
                activeServer: { kind: 'relay' as const, backend: 'b', wss: 'w', siteId: '0000' },
                identity,
            },
            committedSiteId: null,
        } as unknown as Parameters<typeof sessionForPage>[0];

        expect(sessionForPage(home)).toEqual({
            context: {
                cloud: { cloudId: 'default', siteId: '0000', isActive: false },
                identity: { userId: 'u1', isAuthenticated: true },
            },
            committedSiteId: '0000',
        });
    });

    it("hands a page a cloud's own ids, as before", () => {
        const cloud = {
            context: {
                cloud: { cloudId: 'c1', siteId: 's1', backend: 'b', wss: 'w', isActive: true },
                relay: { backend: 'b', wss: 'w', siteId: '0000', isAuthenticated: true },
                activeServer: { kind: 'cloud' as const, cloudId: 'c1', backend: 'b', wss: 'w', siteId: 's1' },
                identity,
            },
            committedSiteId: 's1',
        } as unknown as Parameters<typeof sessionForPage>[0];

        expect(sessionForPage(cloud).context.cloud).toEqual({ cloudId: 'c1', siteId: 's1', isActive: true });
        expect(sessionForPage(cloud).committedSiteId).toBe('s1');
    });
});
