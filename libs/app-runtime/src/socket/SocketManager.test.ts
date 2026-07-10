import { createClientSocketV2 } from '@lemoncloud/chatic-sockets-lib';
import type { ClientSocketV2 } from '@lemoncloud/chatic-sockets-lib';

import { SocketManager } from './SocketManager';
import type { SocketBindingConfig } from './types';

// SocketManager is the only owner of createClientSocketV2; mock the value export so
// ensure() yields a controllable fake client (types are erased at runtime).
jest.mock('@lemoncloud/chatic-sockets-lib', () => ({
    createClientSocketV2: jest.fn(),
}));

const mockedCreate = createClientSocketV2 as jest.MockedFunction<typeof createClientSocketV2>;

const makeClient = (overrides: Partial<jest.Mocked<ClientSocketV2>> = {}): jest.Mocked<ClientSocketV2> =>
    ({
        request: jest.fn(),
        send: jest.fn(),
        onType: jest.fn().mockReturnValue(jest.fn()),
        onState: jest.fn().mockReturnValue(jest.fn()),
        onError: jest.fn().mockReturnValue(jest.fn()),
        onMessage: jest.fn().mockReturnValue(jest.fn()),
        connect: jest.fn().mockResolvedValue(undefined),
        disconnect: jest.fn().mockResolvedValue(undefined),
        destroy: jest.fn(),
        state: 'connected',
        ...overrides,
    }) as unknown as jest.Mocked<ClientSocketV2>;

const CONFIG: SocketBindingConfig = { url: 'wss://example.test/socket', deviceId: 'device-1' };
const OTHER_CONFIG: SocketBindingConfig = { url: 'wss://example.test/socket', deviceId: 'device-2' };
const REQUEST_ERROR = { errorCode: 401, message: 'UNAUTHORIZED' };

describe('SocketManager request facade', () => {
    beforeEach(() => {
        mockedCreate.mockReset();
    });

    it('routes request() to the current client and returns its result', async () => {
        const client = makeClient();
        client.request.mockResolvedValueOnce('response-data');
        mockedCreate.mockReturnValue(client);

        const manager = new SocketManager();
        manager.ensure(CONFIG);

        const result = await manager.request('test.type', { foo: 'bar' });

        expect(client.request).toHaveBeenCalledWith('test.type', { foo: 'bar' }, undefined);
        expect(result).toBe('response-data');
    });

    it('rethrows request errors — recovery is owned by the SDK AuthController, not the request path', async () => {
        const client = makeClient();
        client.request.mockRejectedValueOnce(REQUEST_ERROR);
        mockedCreate.mockReturnValue(client);

        const manager = new SocketManager();
        manager.ensure(CONFIG);

        await expect(manager.request('test.type')).rejects.toEqual(REQUEST_ERROR);
        expect(client.request).toHaveBeenCalledTimes(1);
    });

    it('throws when request() is called before a client exists', async () => {
        const manager = new SocketManager();
        await expect(manager.request('test.type')).rejects.toThrow('Socket client not ready');
    });
});

describe('SocketManager isVerified derivation', () => {
    beforeEach(() => {
        mockedCreate.mockReset();
    });

    it('derives isVerified = authenticated AND connected, and a drop clears it', () => {
        let stateCb: ((event: { next: string }) => void) | undefined;
        const client = makeClient({
            onState: jest.fn((cb: (event: { next: string }) => void) => {
                stateCb = cb;
                return jest.fn();
            }) as unknown as jest.Mocked<ClientSocketV2>['onState'],
        });
        mockedCreate.mockReturnValue(client);

        const manager = new SocketManager();
        manager.ensure(CONFIG); // client.state === 'connected', not yet authenticated
        expect(manager.getSnapshot().isVerified).toBe(false);

        // authenticated + connected → verified
        manager.setAuthenticated(true);
        expect(manager.getSnapshot().isVerified).toBe(true);

        // de-authenticated → not verified
        manager.setAuthenticated(false);
        expect(manager.getSnapshot().isVerified).toBe(false);

        // authenticated again, then a transport drop clears verification via derivation
        manager.setAuthenticated(true);
        expect(manager.getSnapshot().isVerified).toBe(true);
        stateCb?.({ next: 'closed' });
        expect(manager.getSnapshot().isVerified).toBe(false);
    });
});

describe('SocketManager onType rebinding', () => {
    beforeEach(() => {
        mockedCreate.mockReset();
    });

    it('re-binds owned push subscriptions to the replacement client', () => {
        const first = makeClient();
        const second = makeClient();
        mockedCreate.mockReturnValueOnce(first).mockReturnValueOnce(second);

        const manager = new SocketManager();
        manager.ensure(CONFIG);

        const listener = jest.fn();
        manager.onType('chat.sync', listener);
        expect(first.onType).toHaveBeenCalledWith('chat.sync', listener);

        // A different config tears down the old client and builds a fresh one.
        manager.ensure(OTHER_CONFIG);
        expect(second.onType).toHaveBeenCalledWith('chat.sync', listener);
    });
});

describe('SocketManager waitUntilVerified', () => {
    beforeEach(() => {
        mockedCreate.mockReset();
    });

    it('resolves true immediately when already verified', async () => {
        mockedCreate.mockReturnValue(makeClient());
        const manager = new SocketManager();
        manager.ensure(CONFIG);
        manager.setAuthenticated(true);

        await expect(manager.waitUntilVerified(1000)).resolves.toBe(true);
    });

    it('resolves true once the socket becomes verified before the timeout', async () => {
        mockedCreate.mockReturnValue(makeClient());
        const manager = new SocketManager();
        manager.ensure(CONFIG);

        const pending = manager.waitUntilVerified(1000);
        manager.setAuthenticated(true);

        await expect(pending).resolves.toBe(true);
    });

    it('resolves false when the handshake does not complete before the timeout', async () => {
        jest.useFakeTimers();
        mockedCreate.mockReturnValue(makeClient());
        const manager = new SocketManager();
        manager.ensure(CONFIG);

        const pending = manager.waitUntilVerified(1000);
        jest.advanceTimersByTime(1000);

        await expect(pending).resolves.toBe(false);
        jest.useRealTimers();
    });

    it('does not flip to false after resolving true, even past the timeout window', async () => {
        jest.useFakeTimers();
        mockedCreate.mockReturnValue(makeClient());
        const manager = new SocketManager();
        manager.ensure(CONFIG);

        const pending = manager.waitUntilVerified(1000);
        manager.setAuthenticated(true);
        jest.advanceTimersByTime(5000);

        await expect(pending).resolves.toBe(true);
        jest.useRealTimers();
    });
});

describe('SocketManager subscribeClient', () => {
    beforeEach(() => {
        mockedCreate.mockReset();
    });

    it('notifies every client listener on client change (regression: single-slot drop)', () => {
        const client = makeClient();
        mockedCreate.mockReturnValue(client);

        const manager = new SocketManager();
        const first = jest.fn();
        const second = jest.fn();
        manager.subscribeClient(first);
        manager.subscribeClient(second);
        first.mockClear();
        second.mockClear();

        manager.ensure(CONFIG);

        expect(first).toHaveBeenCalledWith(client);
        expect(second).toHaveBeenCalledWith(client);
    });
});
