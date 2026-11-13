import type { SocketState } from '@chatic/transport';
import type * as RuntimeConnectionModule from './runtimeConnection';

/**
 * A manager with what the runtime connection reads. Teardown announces the slot while it is still
 * bound and removes it afterwards, the order SocketManager.teardownEntry uses.
 */
const createFakeManager = () => {
    const bound = new Map<string, boolean>();
    const clientListeners = new Set<(key: string, client: object | null) => void>();
    const verifiedListeners = new Set<(key: string) => void>();
    const activeListeners = new Set<() => void>();
    const activeClientListeners = new Set<(client: object | null) => void>();
    let active: SocketState = {
        state: 'idle',
        isConnected: false,
        isVerified: false,
        connectionId: null,
    } as SocketState;
    return {
        getSnapshot: () => active,
        subscribe: (listener: () => void) => {
            activeListeners.add(listener);
            return () => activeListeners.delete(listener);
        },
        getSlotKeys: () => [...bound.keys()],
        isSlotVerified: (key: string) => bound.get(key) === true,
        subscribeSlotClients: (listener: (key: string, client: object | null) => void) => {
            clientListeners.add(listener);
            for (const key of bound.keys()) listener(key, {});
            return () => clientListeners.delete(listener);
        },
        subscribeSlotVerified: (key: string, listener: (verified: boolean) => void) => {
            const onChange = (changed: string) => changed === key && listener(bound.get(key) === true);
            verifiedListeners.add(onChange);
            listener(bound.get(key) === true);
            return () => verifiedListeners.delete(onChange);
        },
        subscribeClient: (listener: (client: object | null) => void) => {
            activeClientListeners.add(listener);
            return () => activeClientListeners.delete(listener);
        },
        onMessage: jest.fn((_listener: (event: { message: unknown }) => void) => jest.fn()),
        waitUntilVerified: jest.fn(async () => true),
        waitUntilSlotVerified: jest.fn(async () => true),
        getScopedClient: jest.fn(() => ({ request: jest.fn(async () => ({ ok: true })) })),
        onType: jest.fn(() => jest.fn()),
        onSlotType: jest.fn(() => jest.fn()),
        setRequestObserver: jest.fn(),
        getSlotStatuses: jest.fn(() => [{ key: 'default' }]),
        disconnect: jest.fn(async () => undefined),
        bind(key: string, verified = false) {
            bound.set(key, verified);
            clientListeners.forEach(listener => listener(key, {}));
        },
        setVerified(key: string, verified: boolean) {
            bound.set(key, verified);
            verifiedListeners.forEach(listener => listener(key));
        },
        tearDown(key: string) {
            clientListeners.forEach(listener => listener(key, null));
            bound.delete(key);
        },
        setActive(next: Partial<SocketState>) {
            active = { ...active, ...next };
            activeListeners.forEach(listener => listener());
        },
        setActiveClient(client: object | null) {
            activeClientListeners.forEach(listener => listener(client));
        },
    };
};

let mockManager = createFakeManager();
const mockSetJoined = jest.fn();
jest.mock('@chatic/transport', () => ({
    ...jest.requireActual('@chatic/transport'),
    getSocketManager: () => mockManager,
    backgroundClouds: { setJoined: (cids: string[]) => mockSetJoined(cids) },
}));

const mockReclaim = jest.fn(async () => []);
const mockRecoverUnverified = jest.fn(async () => undefined);
const mockRecoverOnResume = jest.fn(async () => undefined);
jest.mock('@chatic/auth', () => ({
    reclaimOwnedClouds: (...args: unknown[]) => mockReclaim(...(args as [])),
    recoverUnverifiedSockets: () => mockRecoverUnverified(),
    recoverSocketsOnResume: () => mockRecoverOnResume(),
}));

let mockCommitListeners: Array<{ kinds: readonly string[]; listener: () => void }> = [];
jest.mock('@chatic/session', () => ({
    sessionSignal: {
        subscribe: (kinds: readonly string[], listener: () => void) => {
            const entry = { kinds, listener };
            mockCommitListeners.push(entry);
            return () => {
                mockCommitListeners = mockCommitListeners.filter(e => e !== entry);
            };
        },
    },
}));
/** Fires every listener subscribed to `kind`, the way the session signal flushes one. */
const emit = (kind: string) => mockCommitListeners.filter(e => e.kinds.includes(kind)).forEach(e => e.listener());

// Required after the mocks: their factories read the `mock*` values above.
const { createCoreRuntimeConnection } = require('./runtimeConnection') as typeof RuntimeConnectionModule;

beforeEach(() => {
    jest.clearAllMocks();
    mockManager = createFakeManager();
    mockCommitListeners = [];
});

describe('the core runtime connection — its snapshot', () => {
    it('lists the bound slots that are verified, leaving out the ones still handshaking', () => {
        mockManager.bind('default', true);
        mockManager.bind('cloud-a', false);

        expect(createCoreRuntimeConnection().snapshot().verifiedSlots).toEqual(['default']);
    });

    it('follows a slot that binds and then verifies after subscribing', () => {
        const connection = createCoreRuntimeConnection();
        const listener = jest.fn();
        connection.subscribe(listener);

        mockManager.bind('cloud-a');
        expect(connection.snapshot().verifiedSlots).toEqual([]);

        mockManager.setVerified('cloud-a', true);
        expect(listener).toHaveBeenCalled();
        expect(connection.snapshot().verifiedSlots).toEqual(['cloud-a']);
    });

    it('drops a slot once its teardown has finished, and says so after it', async () => {
        mockManager.bind('cloud-a', true);
        const connection = createCoreRuntimeConnection();
        const listener = jest.fn();
        connection.subscribe(listener);
        listener.mockClear();

        mockManager.tearDown('cloud-a');
        await Promise.resolve();

        expect(listener).toHaveBeenCalled();
        expect(connection.snapshot().verifiedSlots).toEqual([]);
    });

    it('carries the active slot and follows it', () => {
        const connection = createCoreRuntimeConnection();
        const listener = jest.fn();
        connection.subscribe(listener);

        mockManager.setActive({ state: 'connected', isConnected: true, isVerified: true } as Partial<SocketState>);

        expect(listener).toHaveBeenCalled();
        expect(connection.snapshot().active).toMatchObject({ isConnected: true, isVerified: true });
    });

    it('is the same object, its list too, while nothing changed', () => {
        mockManager.bind('cloud-a', true);
        const connection = createCoreRuntimeConnection();
        const first = connection.snapshot();

        mockManager.setVerified('cloud-a', true);

        expect(connection.snapshot()).toBe(first);
        mockManager.setActive({ connectionId: 'c-2' });
        expect(connection.snapshot()).not.toBe(first);
        expect(connection.snapshot().verifiedSlots).toBe(first.verifiedSlots);
    });
});

describe('the core runtime connection — its subscribers', () => {
    it('shares one upstream subscription between every subscriber, and lets it go with the last', () => {
        const subscribeActive = jest.spyOn(mockManager, 'subscribe');
        const connection = createCoreRuntimeConnection();
        const first = jest.fn();
        const second = jest.fn();

        const stopFirst = connection.subscribe(first);
        const stopSecond = connection.subscribe(second);
        mockManager.setActive({ connectionId: 'c-2' });

        expect(subscribeActive).toHaveBeenCalledTimes(1);
        expect(first).toHaveBeenCalled();
        expect(second).toHaveBeenCalled();

        stopFirst();
        first.mockClear();
        mockManager.setActive({ connectionId: 'c-3' });
        expect(first).not.toHaveBeenCalled();
        expect(second).toHaveBeenCalled();

        stopSecond();
        second.mockClear();
        mockManager.setActive({ connectionId: 'c-4' });
        expect(second).not.toHaveBeenCalled();
        connection.subscribe(jest.fn());
        expect(subscribeActive).toHaveBeenCalledTimes(2);
    });
});

describe('the core runtime connection — waits, requests and pushes', () => {
    it('waits on a named slot, or on the active one', async () => {
        const connection = createCoreRuntimeConnection();

        await connection.waitUntilVerified('default' as never, 5000);
        await connection.waitUntilVerified(null, 3000);

        expect(mockManager.waitUntilSlotVerified).toHaveBeenCalledWith('default', 5000);
        expect(mockManager.waitUntilVerified).toHaveBeenCalledWith(3000);
    });

    it('sends a request on the named slot, whichever is active', async () => {
        await expect(
            createCoreRuntimeConnection().requestOnSlot('default' as never, 'user.profile', { a: 1 })
        ).resolves.toEqual({ ok: true });

        expect(mockManager.getScopedClient).toHaveBeenCalledWith('default');
    });

    it('hears a push from a named slot, or from the active one', () => {
        const connection = createCoreRuntimeConnection();
        const listener = jest.fn();

        connection.onServerEvent('join.sync', listener, { slot: 'default' as never });
        connection.onServerEvent('profile.sync', listener);

        expect(mockManager.onSlotType).toHaveBeenCalledWith('default', 'join.sync', listener);
        expect(mockManager.onType).toHaveBeenCalledWith('profile.sync', listener);
    });

    it('hears every frame, re-attaching as the active client changes, and lets go on stop', () => {
        const connection = createCoreRuntimeConnection();
        const listener = jest.fn();
        const detachFirst = jest.fn();
        mockManager.onMessage.mockReturnValueOnce(detachFirst);

        const stop = connection.onServerMessage(listener);
        mockManager.setActiveClient({});
        const frame = mockManager.onMessage.mock.calls[0][0];
        frame({ message: { type: 'chat.feed' } });
        mockManager.setActiveClient({});

        expect(listener).toHaveBeenCalledWith({ type: 'chat.feed' });
        expect(detachFirst).toHaveBeenCalled();
        expect(mockManager.onMessage).toHaveBeenCalledTimes(2);
        stop();
        mockManager.setActiveClient({});
        expect(mockManager.onMessage).toHaveBeenCalledTimes(2);
    });

    it('observes requests, lists slots, and kicks and recovers the sockets', async () => {
        const connection = createCoreRuntimeConnection();
        const observer = jest.fn();

        const stop = connection.observeRequests(observer);
        stop();
        await expect(connection.slotStatuses()).resolves.toEqual([{ key: 'default' }]);
        await connection.reconnect();
        await connection.recoverUnverified();
        await connection.recoverOnResume();

        expect(mockManager.setRequestObserver.mock.calls).toEqual([[observer], [undefined]]);
        expect(mockManager.disconnect).toHaveBeenCalledTimes(1);
        expect(mockRecoverUnverified).toHaveBeenCalledTimes(1);
        expect(mockRecoverOnResume).toHaveBeenCalledTimes(1);
    });
});

describe('the core runtime connection — the request observer', () => {
    it('keeps a newer observer when an older one is stopped', () => {
        const connection = createCoreRuntimeConnection();
        const first = jest.fn();
        const second = jest.fn();

        const stopFirst = connection.observeRequests(first);
        const stopSecond = connection.observeRequests(second);
        stopFirst();

        expect(mockManager.setRequestObserver.mock.calls).toEqual([[first], [second]]);
        stopSecond();
        expect(mockManager.setRequestObserver).toHaveBeenLastCalledWith(undefined);
    });
});

describe('the core runtime connection — the clouds it keeps', () => {
    it('hands the background clouds to the transport', () => {
        createCoreRuntimeConnection().setBackgroundClouds(['a', 'b']);

        expect(mockSetJoined).toHaveBeenCalledWith(['a', 'b']);
    });

    it('reclaims the owned clouds, with the invited overlap', () => {
        createCoreRuntimeConnection().setOwnedClouds(['a', 'b'], ['b']);

        expect(mockReclaim).toHaveBeenCalledWith(['a', 'b'], ['b']);
    });

    it('reclaims again when either list changes, and not for the same content', () => {
        const connection = createCoreRuntimeConnection();

        connection.setOwnedClouds(['a'], []);
        connection.setOwnedClouds(['a'], []);
        connection.setOwnedClouds(['a'], ['a']);
        connection.setOwnedClouds(['a', 'b'], ['a']);

        expect(mockReclaim.mock.calls).toEqual([
            [['a'], []],
            [['a'], ['a']],
            [['a', 'b'], ['a']],
        ]);
    });

    it('reclaims again on a cloud token commit, with the latest lists, and on no other signal', () => {
        // An invite entry committed after the catalog resolved: no list change follows it.
        const connection = createCoreRuntimeConnection();
        connection.setOwnedClouds(['a'], []);
        connection.setOwnedClouds(['a', 'b'], ['b']);
        mockReclaim.mockClear();

        emit('selection');
        expect(mockReclaim).not.toHaveBeenCalled();
        emit('cloud:token');
        expect(mockReclaim).toHaveBeenCalledWith(['a', 'b'], ['b']);
    });

    it('does nothing while the account owns no cloud, a commit included', () => {
        createCoreRuntimeConnection().setOwnedClouds([], []);

        emit('cloud:token');

        expect(mockReclaim).not.toHaveBeenCalled();
    });
});
