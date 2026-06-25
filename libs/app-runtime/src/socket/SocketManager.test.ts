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
const ERROR_401 = { errorCode: 401, message: 'UNAUTHORIZED' };

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

    it('on 401 invokes the recovery handler and retries once on success', async () => {
        const client = makeClient();
        client.request.mockRejectedValueOnce(ERROR_401).mockResolvedValueOnce('retry-data');
        mockedCreate.mockReturnValue(client);

        const manager = new SocketManager();
        manager.ensure(CONFIG);
        const recover = jest.fn().mockResolvedValue(true);
        manager.setRecoveryHandler(recover);

        const result = await manager.request('test.type', { foo: 'bar' });

        expect(recover).toHaveBeenCalledTimes(1);
        expect(client.request).toHaveBeenCalledTimes(2);
        expect(result).toBe('retry-data');
    });

    it('rethrows the original 401 when recovery fails (no retry)', async () => {
        const client = makeClient();
        client.request.mockRejectedValueOnce(ERROR_401);
        mockedCreate.mockReturnValue(client);

        const manager = new SocketManager();
        manager.ensure(CONFIG);
        manager.setRecoveryHandler(jest.fn().mockResolvedValue(false));

        await expect(manager.request('test.type')).rejects.toEqual(ERROR_401);
        expect(client.request).toHaveBeenCalledTimes(1);
    });

    it('rethrows a 401 without retry when no recovery handler is set', async () => {
        const client = makeClient();
        client.request.mockRejectedValueOnce(ERROR_401);
        mockedCreate.mockReturnValue(client);

        const manager = new SocketManager();
        manager.ensure(CONFIG);

        await expect(manager.request('test.type')).rejects.toEqual(ERROR_401);
        expect(client.request).toHaveBeenCalledTimes(1);
    });

    it('throws when request() is called before a client exists', async () => {
        const manager = new SocketManager();
        await expect(manager.request('test.type')).rejects.toThrow('Socket client not ready');
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
