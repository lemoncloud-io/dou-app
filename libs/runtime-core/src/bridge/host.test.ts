import type { OnRuntimeEventPayload, OnRuntimeSessionChangedPayload } from '@chatic/bridge-messages';

import type { RuntimeEngine } from '../engine';
import {
    RUNTIME_CONTRACT_MISMATCH_CODE,
    RUNTIME_LISTENER_MARKER,
    RUNTIME_NOT_STARTED_CODE,
    RUNTIME_PAYLOAD_TOO_LARGE_CODE,
    RUNTIME_STARTING_CODE,
    createRuntimeBridgeHost,
} from './host';
import type { RuntimeBridgeHostOptions } from './host';
import { RUNTIME_CONTRACT_VERSION } from './contract';
import { RUNTIME_ERROR_CODE, RUNTIME_NOT_AVAILABLE_CODE } from './errors';

/** An engine with the members the tests reach, each recording how it was called. */
const fakeEngine = () => {
    const sessionListeners = new Set<() => void>();
    let snapshot = { auth: { isAuthenticated: true }, relayUser: { id: 'u1' } };
    const observers = new Map<string, (...args: unknown[]) => void>();
    const stops: string[] = [];
    const logoutListeners = new Set<() => void>();
    const connectionListeners = new Set<() => void>();
    let connectionSnapshot = { active: { state: 'idle' }, verifiedSlots: [] as string[], online: true };
    const engine = {
        session: {
            snapshot: () => snapshot,
            subscribe: (listener: () => void) => {
                sessionListeners.add(listener);
                return () => sessionListeners.delete(listener);
            },
            onLogout: (listener: () => void) => {
                logoutListeners.add(listener);
                return () => logoutListeners.delete(listener);
            },
        },
        commands: {
            switchSite: jest.fn(async (siteId: string) => {
                if (siteId === 'bad') throw Object.assign(new Error('403 FORBIDDEN - nope'), { errorCode: 403 });
            }),
        },
        connection: {
            slotStatuses: jest.fn(async () => [{ key: 'default' }]),
            snapshot: () => connectionSnapshot,
            subscribe: (listener: () => void) => {
                connectionListeners.add(listener);
                return () => connectionListeners.delete(listener);
            },
            onServerEvent: jest.fn((type: string, listener: (...args: unknown[]) => void) => {
                observers.set(`server:${type}`, listener);
                return () => stops.push(`server:${type}`);
            }),
            requestOnSlot: jest.fn(),
        },
        sync: {
            registerTarget: jest.fn(() => () => stops.push('target')),
            refusedChannels: () => ['ch-gone'],
            subscribeRefusedChannels: jest.fn(() => () => undefined),
        },
        data: {
            clearLocalCaches: jest.fn(async () => ({ cleared: 2 })),
            repositories: () => ({
                user: {
                    listDevices: jest.fn(async () => ({ list: [{ id: 'd1' }] })),
                    observeItem: jest.fn((id: string, callback: (...args: unknown[]) => void) => {
                        observers.set(`user:${id}`, callback);
                        return () => stops.push(`user:${id}`);
                    }),
                },
            }),
            cloudRepositories: jest.fn((cid: string) => ({
                chat: { getChat: jest.fn(async (id: string) => ({ id, cid })) },
            })),
        },
    };
    const logout = () => logoutListeners.forEach(listener => listener());
    const changeConnection = (next: Partial<typeof connectionSnapshot>) => {
        connectionSnapshot = { ...connectionSnapshot, ...next };
        connectionListeners.forEach(listener => listener());
    };
    const changeSession = (next: typeof snapshot) => {
        snapshot = next;
        sessionListeners.forEach(listener => listener());
    };
    return {
        engine: engine as unknown as RuntimeEngine,
        raw: engine,
        observers,
        stops,
        changeSession,
        sessionListeners,
        logout,
        logoutListeners,
        changeConnection,
        connectionListeners,
    };
};

const setup = (overrides: Partial<RuntimeBridgeHostOptions> = {}) => {
    const fake = fakeEngine();
    const events: OnRuntimeEventPayload[] = [];
    const pushes: OnRuntimeSessionChangedPayload[] = [];
    const scheduled: (() => void)[] = [];
    const host = createRuntimeBridgeHost({
        engine: async () => fake.engine,
        send: { event: payload => events.push(payload), sessionChanged: payload => pushes.push(payload) },
        schedule: run => scheduled.push(run),
        ...overrides,
    });
    const flush = () => scheduled.splice(0).forEach(run => run());
    return { fake, host, events, pushes, flush };
};

const hello = { contracts: [RUNTIME_CONTRACT_VERSION] };

describe('createRuntimeBridgeHost — hello', () => {
    it('answers native with the contract and the session, numbered', async () => {
        const { host } = setup();
        await expect(host.hello(hello)).resolves.toEqual({
            value: {
                sessionOwner: 'native',
                contract: RUNTIME_CONTRACT_VERSION,
                seq: 0,
                session: { auth: { isAuthenticated: true }, relayUser: { id: 'u1' } },
            },
        });
    });

    it('answers web when this process does not run the session, or shares no contract with the page', async () => {
        await expect(setup({ engine: async () => null }).host.hello(hello)).resolves.toEqual({
            value: { sessionOwner: 'web' },
        });
        await expect(setup().host.hello({ contracts: [999] })).resolves.toEqual({ value: { sessionOwner: 'web' } });
    });

    it('answers RUNTIME_STARTING while the runtime is still starting, so the page asks again', async () => {
        jest.useFakeTimers();
        try {
            const { host } = setup({ engine: () => new Promise(() => undefined), helloWaitMs: 50 });
            const answer = host.hello(hello);
            jest.advanceTimersByTime(50);
            await expect(answer).resolves.toMatchObject({ failure: { code: RUNTIME_STARTING_CODE } });
        } finally {
            jest.useRealTimers();
        }
    });

    it("never answers web once a page was answered native, and ends the last page's streams", async () => {
        const { host, fake } = setup();
        await host.hello(hello);
        await host.subscribe({
            subscriptionId: 's',
            target: 'data',
            topic: 'user.observeItem',
            args: ['u1', RUNTIME_LISTENER_MARKER],
        });

        await expect(host.hello({ contracts: [999] })).resolves.toMatchObject({
            failure: { code: RUNTIME_CONTRACT_MISMATCH_CODE },
        });
        expect(fake.stops).toEqual(['user:u1']);
    });

    it('answers nothing native after the bridge was disposed while a hello waited', async () => {
        let release: (engine: RuntimeEngine) => void = () => undefined;
        const fake = fakeEngine();
        const { host } = setup({ engine: () => new Promise(resolve => (release = resolve)) });

        const answer = host.hello(hello);
        host.dispose();
        release(fake.engine);

        await expect(answer).resolves.toMatchObject({ failure: { code: RUNTIME_NOT_STARTED_CODE } });
        expect(fake.sessionListeners.size).toBe(0);
    });

    it('pushes each change of the session once per turn, numbered after the hello', async () => {
        const { host, fake, pushes, flush } = setup();
        await host.hello(hello);

        fake.changeSession({ auth: { isAuthenticated: false }, relayUser: { id: 'u1' } });
        fake.changeSession({ auth: { isAuthenticated: false }, relayUser: { id: 'u2' } });
        flush();

        expect(pushes).toEqual([
            { seq: 1, signals: ['session'], session: { auth: { isAuthenticated: false }, relayUser: { id: 'u2' } } },
        ]);
        await expect(host.hello(hello)).resolves.toMatchObject({ value: { seq: 1 } });
        // One push subscription, however many pages said hello.
        expect(fake.sessionListeners.size).toBe(1);
    });
});

describe('createRuntimeBridgeHost — the views and the sign-out', () => {
    it('pushes a sign-out as the logout signal, with the change it brought in the same push', async () => {
        const { host, fake, pushes, flush } = setup();
        await host.hello(hello);

        fake.logout();
        fake.changeSession({ auth: { isAuthenticated: false }, relayUser: { id: 'u1' } });
        flush();

        expect(pushes).toEqual([
            {
                seq: 1,
                signals: ['logout', 'session'],
                session: { auth: { isAuthenticated: false }, relayUser: { id: 'u1' } },
            },
        ]);
    });

    it("mirrors the connection's snapshot as a stream: now, then each change once per turn", async () => {
        const { host, fake, events, flush } = setup();
        await host.hello(hello);

        await expect(
            host.subscribe({ subscriptionId: 'v', target: 'connection', topic: 'snapshot', args: [] })
        ).resolves.toEqual({ value: {} });
        flush();
        fake.changeConnection({ online: false });
        fake.changeConnection({ verifiedSlots: ['default'] });
        flush();

        expect(events.map(event => event.event)).toEqual([
            [{ active: { state: 'idle' }, verifiedSlots: [], online: true }],
            [{ active: { state: 'idle' }, verifiedSlots: ['default'], online: false }],
        ]);
        host.unsubscribe({ subscriptionId: 'v' });
        expect(fake.connectionListeners.size).toBe(0);
    });

    it("mirrors the sync's refused rooms as a stream", async () => {
        const { host, fake, events, flush } = setup();
        await host.hello(hello);

        await host.subscribe({ subscriptionId: 'r', target: 'sync', topic: 'refusedChannels', args: [] });
        flush();

        expect(events).toEqual([{ subscriptionId: 'r', seq: 1, event: [['ch-gone']] }]);
        expect(fake.raw.sync.subscribeRefusedChannels).toHaveBeenCalled();
    });
});

describe('createRuntimeBridgeHost — calls', () => {
    it('refuses calls before a hello was answered native', async () => {
        const { host } = setup();
        await expect(host.call({ target: 'session', method: 'switchSite', args: ['s1'] })).resolves.toMatchObject({
            failure: { code: RUNTIME_NOT_STARTED_CODE },
        });
    });

    it('runs the members the contract lists, by target, and answers what they resolve with', async () => {
        const { host, fake } = setup();
        await host.hello(hello);

        await expect(host.call({ target: 'session', method: 'switchSite', args: ['s1'] })).resolves.toEqual({
            value: { value: null },
        });
        expect(fake.raw.commands.switchSite).toHaveBeenCalledWith('s1');
        await expect(host.call({ target: 'connection', method: 'slotStatuses', args: [] })).resolves.toEqual({
            value: { value: [{ key: 'default' }] },
        });
        await expect(host.call({ target: 'data', method: 'clearLocalCaches', args: [] })).resolves.toEqual({
            value: { value: { cleared: 2 } },
        });
        await expect(host.call({ target: 'data', method: 'user.listDevices', args: [] })).resolves.toEqual({
            value: { value: { list: [{ id: 'd1' }] } },
        });
        await expect(host.call({ target: 'data@cloud', method: 'chat.getChat', args: ['c9', 'm1'] })).resolves.toEqual({
            value: { value: { id: 'm1', cid: 'c9' } },
        });
        expect(fake.raw.data.cloudRepositories).toHaveBeenCalledWith('c9');
    });

    it('answers RUNTIME_NOT_AVAILABLE for anything the contract does not list, however it is spelled', async () => {
        const { host, fake } = setup();
        await host.hello(hello);

        for (const [target, method] of [
            ['connection', 'requestOnSlot'],
            ['session', 'toString'],
            ['data', 'repositories'],
            ['data', 'user.constructor'],
            ['nowhere', 'anything'],
        ]) {
            await expect(host.call({ target, method, args: [] })).resolves.toMatchObject({
                failure: { code: RUNTIME_NOT_AVAILABLE_CODE },
            });
        }
        expect(fake.raw.connection.requestOnSlot).not.toHaveBeenCalled();
    });

    it('answers RUNTIME_ERROR with the fields a screen reads when the member throws', async () => {
        const { host } = setup();
        await host.hello(hello);

        await expect(host.call({ target: 'session', method: 'switchSite', args: ['bad'] })).resolves.toMatchObject({
            failure: { code: RUNTIME_ERROR_CODE, details: { message: '403 FORBIDDEN - nope', errorCode: 403 } },
        });
    });

    it('refuses a result larger than the limit, and reports every size', async () => {
        const sizes: number[] = [];
        const { host } = setup({ payloadLimit: 10, onPayload: sample => sizes.push(sample.size) });
        await host.hello(hello);

        await expect(host.call({ target: 'data', method: 'user.listDevices', args: [] })).resolves.toMatchObject({
            failure: { code: RUNTIME_PAYLOAD_TOO_LARGE_CODE },
        });
        expect(sizes.length).toBe(2);
    });
});

describe('createRuntimeBridgeHost — subscriptions', () => {
    it('puts its listener where the page marked it, and numbers the events', async () => {
        const { host, fake, events } = setup();
        await host.hello(hello);

        await expect(
            host.subscribe({
                subscriptionId: 's1',
                target: 'data',
                topic: 'user.observeItem',
                args: ['u7', RUNTIME_LISTENER_MARKER],
            })
        ).resolves.toEqual({ value: {} });
        fake.observers.get('user:u7')?.({ id: 'u7', name: 'a' });
        fake.observers.get('user:u7')?.(null);

        expect(events).toEqual([
            { subscriptionId: 's1', seq: 1, event: [{ id: 'u7', name: 'a' }] },
            { subscriptionId: 's1', seq: 2, event: [null] },
        ]);
    });

    it('stops a stream on unsubscribe, on a new subscription under the same id, and on a new hello', async () => {
        const { host, fake } = setup();
        await host.hello(hello);
        await host.subscribe({
            subscriptionId: 'a',
            target: 'data',
            topic: 'user.observeItem',
            args: ['u1', RUNTIME_LISTENER_MARKER],
        });
        await host.subscribe({
            subscriptionId: 'a',
            target: 'data',
            topic: 'user.observeItem',
            args: ['u2', RUNTIME_LISTENER_MARKER],
        });
        await host.subscribe({ subscriptionId: 'b', target: 'sync', topic: 'registerTarget', args: [{ id: 't' }] });
        await host.subscribe({
            subscriptionId: 'c',
            target: 'connection',
            topic: 'onServerEvent',
            args: ['chat.push', RUNTIME_LISTENER_MARKER],
        });

        host.unsubscribe({ subscriptionId: 'b' });
        expect(fake.stops).toEqual(['user:u1', 'target']);

        await host.hello(hello);
        expect(fake.stops).toEqual(['user:u1', 'target', 'user:u2', 'server:chat.push']);
    });

    it('ends a subscription whose event is too large, and says so in its last event', async () => {
        const { host, fake, events } = setup({ payloadLimit: 20 });
        await host.hello(hello);
        await host.subscribe({
            subscriptionId: 's',
            target: 'data',
            topic: 'user.observeItem',
            args: ['u1', RUNTIME_LISTENER_MARKER],
        });

        fake.observers.get('user:u1')?.({ id: 'u1', name: 'a name far too long' });
        fake.observers.get('user:u1')?.({ id: 'u1' });

        expect(events).toEqual([
            {
                subscriptionId: 's',
                seq: 1,
                event: { $ended: expect.objectContaining({ code: RUNTIME_PAYLOAD_TOO_LARGE_CODE }) },
            },
        ]);
        expect(fake.stops).toEqual(['user:u1']);
    });

    it('refuses a stream the contract does not list, and a call method named as a stream', async () => {
        const { host } = setup();
        await host.hello(hello);
        await expect(
            host.subscribe({
                subscriptionId: 'x',
                target: 'connection',
                topic: 'onServerMessage',
                args: [RUNTIME_LISTENER_MARKER],
            })
        ).resolves.toMatchObject({ failure: { code: RUNTIME_NOT_AVAILABLE_CODE } });
        await expect(
            host.subscribe({ subscriptionId: 'y', target: 'data', topic: 'user.listDevices', args: [] })
        ).resolves.toMatchObject({ failure: { code: RUNTIME_NOT_AVAILABLE_CODE } });
    });

    it('refuses a listener stream without its marker, a listenerless one with one, and one that cannot be stopped', async () => {
        const { host, fake } = setup();
        await host.hello(hello);

        await expect(
            host.subscribe({ subscriptionId: 'a', target: 'data', topic: 'user.observeItem', args: ['u1'] })
        ).resolves.toMatchObject({ failure: { code: RUNTIME_ERROR_CODE } });
        await expect(
            host.subscribe({
                subscriptionId: 'b',
                target: 'sync',
                topic: 'registerTarget',
                args: [RUNTIME_LISTENER_MARKER],
            })
        ).resolves.toMatchObject({ failure: { code: RUNTIME_ERROR_CODE } });
        expect(fake.observers.size).toBe(0);

        fake.raw.sync.registerTarget.mockImplementationOnce((() => undefined) as never);
        await expect(
            host.subscribe({ subscriptionId: 'c', target: 'sync', topic: 'registerTarget', args: [{ id: 't' }] })
        ).resolves.toMatchObject({ failure: { code: RUNTIME_ERROR_CODE } });
    });

    it('keeps numbering events under an id it replaced, so a late event of the old stream never outnumbers the new', async () => {
        const { host, fake, events } = setup();
        await host.hello(hello);
        await host.subscribe({
            subscriptionId: 's',
            target: 'data',
            topic: 'user.observeItem',
            args: ['u1', RUNTIME_LISTENER_MARKER],
        });
        fake.observers.get('user:u1')?.({ id: 'u1' });
        await host.subscribe({
            subscriptionId: 's',
            target: 'data',
            topic: 'user.observeItem',
            args: ['u2', RUNTIME_LISTENER_MARKER],
        });
        fake.observers.get('user:u2')?.({ id: 'u2' });

        expect(events.map(event => event.seq)).toEqual([1, 2]);
    });

    it('refuses an empty cloud id', async () => {
        const { host } = setup();
        await host.hello(hello);
        await expect(
            host.call({ target: 'data@cloud', method: 'chat.getChat', args: ['', 'm1'] })
        ).resolves.toMatchObject({
            failure: { code: RUNTIME_NOT_AVAILABLE_CODE },
        });
    });

    it('ends everything on dispose', async () => {
        const { host, fake } = setup();
        await host.hello(hello);
        await host.subscribe({
            subscriptionId: 's',
            target: 'data',
            topic: 'user.observeItem',
            args: ['u1', RUNTIME_LISTENER_MARKER],
        });

        host.dispose();

        expect(fake.stops).toEqual(['user:u1']);
        expect(fake.sessionListeners.size).toBe(0);
        expect(fake.logoutListeners.size).toBe(0);
    });

    it('ends a view whose read throws with a last event saying so', async () => {
        const { host, fake, events, flush } = setup();
        await host.hello(hello);
        fake.raw.sync.refusedChannels = () => {
            throw new Error('read failed');
        };

        await host.subscribe({ subscriptionId: 'r', target: 'sync', topic: 'refusedChannels', args: [] });
        flush();

        expect(events).toEqual([
            { subscriptionId: 'r', seq: 1, event: { $ended: expect.objectContaining({ code: RUNTIME_ERROR_CODE }) } },
        ]);
    });
});

describe('createRuntimeBridgeHost — with the real scheduler', () => {
    // The page has to keep a stream's events from before its subscribe answer: with a microtask
    // scheduler a view's first value is sent ahead of that answer.
    it("sends a view's first value before the subscribe is answered", async () => {
        const fake = fakeEngine();
        const order: string[] = [];
        const host = createRuntimeBridgeHost({
            engine: async () => fake.engine,
            send: { event: () => order.push('event'), sessionChanged: () => undefined },
        });
        await host.hello(hello);

        const answered = host.subscribe({ subscriptionId: 'v', target: 'connection', topic: 'snapshot', args: [] });
        await answered.then(() => order.push('answer'));

        expect(order).toEqual(['event', 'answer']);
    });
});
