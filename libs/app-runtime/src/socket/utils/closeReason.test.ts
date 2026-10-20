import type { SocketLike } from '@lemoncloud/chatic-sockets-lib';

import { SocketManager } from '../SocketManager';
import type { SocketRequestSample } from '../types';
import { classifySocketClose } from './closeReason';

jest.mock('@chatic/bridges', () => ({
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

/**
 * The real chatic-sockets-lib client, built by the real SocketManager, over a fake WebSocket. Auth
 * and reconnect are off so nothing but the test touches the socket; the keep-alive is shortened so a
 * pong-timeout happens within the test.
 */
const CONNECTING = 0;
const OPEN = 1;
const CLOSED = 3;
let currentSocket: (SocketLike & { emit(type: string, event?: unknown): void }) | undefined;
/** Per test: the reconnect controller is off unless a case turns it on; the keep-alive is short. */
let reconnectOption: false | Record<string, unknown> = false;
const SHORT_KEEP_ALIVE = { intervalMs: 20, timeoutMs: 10, maxMissedPongs: 1 };
let keepAliveOption: false | Record<string, unknown> = SHORT_KEEP_ALIVE;
jest.mock('@lemoncloud/chatic-sockets-lib', () => {
    const actual = jest.requireActual('@lemoncloud/chatic-sockets-lib');
    return {
        ...actual,
        createClientSocketV2: (options: Record<string, unknown>) =>
            actual.createClientSocketV2({
                ...options,
                socketFactory: () => currentSocket,
                auth: false,
                reconnect: reconnectOption,
                keepAlive: keepAliveOption,
            }),
    };
});

const makeSocket = () => {
    const listeners = new Map<string, Set<(event?: unknown) => void>>();
    // Starts CONNECTING, as a real WebSocket does. One created already OPEN is taken as open the
    // moment the transport subscribes, before the transport has stored its connect attempt, and that
    // attempt is then never cleared — every later connect() returns it instead of opening a socket.
    let readyState = CONNECTING;
    const socket: SocketLike & { emit(type: string, event?: unknown): void } = {
        get readyState() {
            return readyState;
        },
        send: () => undefined,
        close: () => undefined,
        addEventListener: (type, listener) => {
            const forType = listeners.get(type) ?? new Set();
            forType.add(listener);
            listeners.set(type, forType);
        },
        removeEventListener: (type, listener) => {
            listeners.get(type)?.delete(listener);
        },
        emit: (type, event) => {
            if (type === 'open') readyState = OPEN;
            if (type === 'close') readyState = CLOSED;
            listeners.get(type)?.forEach(listener => listener(event));
        },
    };
    return socket;
};

describe('classifySocketClose', () => {
    it('names the reasons the SDK and the app close with, whoever reports them', () => {
        expect(classifySocketClose({ code: 1001, reason: 'pong-timeout', wasClean: true }, true)).toBe('pong_timeout');
        expect(classifySocketClose({ code: 1012, reason: 'service-restart', wasClean: true }, true)).toBe(
            'service_restart'
        );
        expect(classifySocketClose({ code: 1000, reason: 'wake-recovery', wasClean: true }, true)).toBe(
            'wake_recovery'
        );
        expect(classifySocketClose({ code: 1000, reason: 'wake-probe', wasClean: true }, false)).toBe('wake_probe');
    });

    it('reads any other local close as other, whatever its code', () => {
        expect(classifySocketClose({ wasClean: true }, true)).toBe('other');
        expect(classifySocketClose({ code: 1000, reason: 'logout', wasClean: true }, true)).toBe('other');
    });

    it('splits a remote close by whether it ended with a close frame', () => {
        expect(classifySocketClose({ code: 1000, reason: 'bye', wasClean: true }, false)).toBe('server');
        expect(classifySocketClose({ code: 1005, wasClean: true }, false)).toBe('server');
        expect(classifySocketClose({ code: 1006, wasClean: false }, false)).toBe('transport');
        expect(classifySocketClose({ code: 1006 }, false)).toBe('transport');
        expect(classifySocketClose({}, false)).toBe('transport');
        expect(classifySocketClose(undefined, false)).toBe('transport');
    });
});

/**
 * The close reason leans on three things chatic-sockets-lib does but does not publish: a `transport`
 * with an `on('close')` that carries the code and reason, a client that subscribes to it ahead of
 * everyone else and rejects its requests there, and a `closing` state that only a local close goes
 * through. This drives the real client so an SDK upgrade that changes any of them fails here, instead
 * of turning every 499 into `transport` without anyone noticing.
 */
describe('close reasons against chatic-sockets-lib', () => {
    const connectedManager = async () => {
        currentSocket = makeSocket();
        const manager = new SocketManager();
        const client = manager.ensure({ url: 'wss://example.test/socket', deviceId: 'device-1', cid: 'default' });
        const connecting = client.connect();
        currentSocket.emit('open');
        await connecting;
        const samples: SocketRequestSample[] = [];
        manager.setRequestObserver(sample => samples.push(sample));
        return { manager, client, samples };
    };

    afterEach(() => {
        currentSocket = undefined;
        reconnectOption = false;
        keepAliveOption = SHORT_KEEP_ALIVE;
    });

    it('names a 499 from the wake kick after its reason', async () => {
        const { manager, client, samples } = await connectedManager();

        const request = manager.request('chat.feed').catch(() => undefined);
        await client.disconnect(1000, 'wake-recovery');
        await request;

        expect(samples).toEqual([expect.objectContaining({ outcome: '499', closeReason: 'wake_recovery' })]);
        manager.destroy();
    });

    // In the app every client has a reconnect controller, and `disconnect` goes through its `stop`
    // and back: the reason has to survive that round trip.
    it('names a 499 from the wake probe after its reason, through the reconnect controller', async () => {
        reconnectOption = { minDelayMs: 60_000 };
        const { manager, client, samples } = await connectedManager();
        expect(client.reconnect).toBeDefined();

        const request = manager.request('chat.feed').catch(() => undefined);
        await client.disconnect(1000, 'wake-probe');
        await request;

        expect(samples).toEqual([expect.objectContaining({ outcome: '499', closeReason: 'wake_probe' })]);
        manager.destroy();
    });

    it('names a 499 from a missed pong after the keep-alive', async () => {
        const { manager, samples } = await connectedManager();

        await manager.request('chat.feed', undefined, { timeoutMs: 5_000 }).catch(() => undefined);

        expect(samples).toEqual([expect.objectContaining({ outcome: '499', closeReason: 'pong_timeout' })]);
        manager.destroy();
    });

    it('names a 499 from a connection the network dropped as transport', async () => {
        const { manager, samples } = await connectedManager();

        const request = manager.request('chat.feed').catch(() => undefined);
        currentSocket?.emit('close', { code: 1006, reason: '', wasClean: false });
        await request;

        expect(samples).toEqual([expect.objectContaining({ outcome: '499', closeReason: 'transport' })]);
        manager.destroy();
    });

    it('names a 499 from a server close frame as server', async () => {
        const { manager, samples } = await connectedManager();

        const request = manager.request('chat.feed').catch(() => undefined);
        currentSocket?.emit('close', { code: 1001, reason: 'going away', wasClean: true });
        await request;

        expect(samples).toEqual([expect.objectContaining({ outcome: '499', closeReason: 'server' })]);
        manager.destroy();
    });

    it('names a 499 from a slot teardown as destroyed', async () => {
        const { manager, samples } = await connectedManager();

        const request = manager.request('chat.feed').catch(() => undefined);
        manager.destroy();
        await request;

        expect(samples).toEqual([expect.objectContaining({ outcome: '499', closeReason: 'destroyed' })]);
    });
});

/**
 * The connection rotation calls the reconnect controller's `restart()`. In chatic-sockets-lib 0.5.7
 * that closes the socket through the controller's own `stop()` and never connects again, so
 * SocketManager reopens it. This pins both halves against the real client: a restart is named
 * `service_restart`, the socket is still closed when `restart()` returns, and the slot comes back.
 * An SDK release that fixes the restart makes this fail — `restart()` then waits for an `open` this
 * test never sends — and that failure is the signal to retire `reopenAfterRestart`.
 */
describe('a restart against chatic-sockets-lib', () => {
    afterEach(() => {
        currentSocket = undefined;
        reconnectOption = false;
        keepAliveOption = SHORT_KEEP_ALIVE;
    });

    it('reopens the socket the restart closed', async () => {
        reconnectOption = { minDelayMs: 60_000 };
        keepAliveOption = false;
        currentSocket = makeSocket();
        const manager = new SocketManager();
        const client = manager.ensure({ url: 'wss://example.test/socket', deviceId: 'device-1', cid: 'default' });
        const connecting = client.connect();
        currentSocket.emit('open');
        await connecting;
        const samples: SocketRequestSample[] = [];
        manager.setRequestObserver(sample => samples.push(sample));

        const request = manager.request('chat.feed').catch(() => undefined);
        // The next connection gets a socket of its own.
        const first = currentSocket;
        currentSocket = makeSocket();
        await client.reconnect?.restart();
        await request;
        expect(samples).toEqual([expect.objectContaining({ outcome: '499', closeReason: 'service_restart' })]);
        expect(client.state).toBe('closed');

        await new Promise(resolve => setTimeout(resolve, 0));
        expect(client.state).toBe('connecting');
        currentSocket.emit('open');
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(client.state).toBe('connected');
        expect(currentSocket).not.toBe(first);
        manager.destroy();
    });
});
