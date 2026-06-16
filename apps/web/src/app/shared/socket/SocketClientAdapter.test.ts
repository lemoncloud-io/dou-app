import { SocketClientAdapter } from './SocketClientAdapter';
import type { SocketManager } from './SocketManager';
import type { ClientSocketV2 } from '@lemoncloud/chatic-sockets-lib';
import { cloudCore, webCore } from '@chatic/web-core';

jest.mock('@chatic/web-core', () => ({
    cloudCore: {
        refreshToken: jest.fn(),
        getIdentityToken: jest.fn(),
    },
    webCore: {
        getTokenSignature: jest.fn(),
    },
}));

jest.mock('@chatic/bridges', () => ({
    logger: {
        info: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    },
}));

describe('SocketClientAdapter Retry Logic', () => {
    let mockClient: jest.Mocked<ClientSocketV2>;
    let mockManager: jest.Mocked<SocketManager>;
    let adapter: SocketClientAdapter;
    let activeClientListener: ((client: ClientSocketV2 | null, cloudId: string) => void) | null = null;
    let activeClientStateListener: ((state: any) => void) | null = null;

    beforeEach(() => {
        jest.clearAllMocks();

        mockClient = {
            state: 'connected',
            request: jest.fn(),
            send: jest.fn(),
            onType: jest.fn(() => jest.fn()),
        } as any;

        activeClientListener = null;
        activeClientStateListener = null;

        mockManager = {
            subscribeActiveClient: jest.fn(listener => {
                activeClientListener = listener;
                listener(mockClient, 'default');
                return jest.fn();
            }),
            subscribeActiveClientState: jest.fn(listener => {
                activeClientStateListener = listener;
                return jest.fn();
            }),
            getActiveClient: jest.fn(() => mockClient),
            getActiveConfig: jest.fn(() => ({
                url: 'wss://test.url',
                deviceId: 'device-123',
                wssType: 'relay',
            })),
        } as any;

        adapter = new SocketClientAdapter(mockManager);
    });

    afterEach(() => {
        adapter.destroy();
    });

    it('should resolve immediately if the request succeeds', async () => {
        mockClient.request.mockResolvedValueOnce('success-response');

        const result = await adapter.request('test.action', { foo: 'bar' });

        expect(result).toBe('success-response');
        expect(mockClient.request).toHaveBeenCalledTimes(1);
        expect(mockClient.request).toHaveBeenCalledWith('test.action', { foo: 'bar' }, undefined);
    });

    describe('401 UNAUTHORIZED retry', () => {
        it('should refresh token, call auth.update, and retry the request once on 401 error', async () => {
            // Setup mock rejections
            const err401 = new Error('401 UNAUTHORIZED');
            mockClient.request
                .mockRejectedValueOnce(err401) // first call fails
                .mockResolvedValueOnce({ status: 'ok' }) // auth.update succeeds
                .mockResolvedValueOnce('success-response'); // retried call succeeds

            // Setup token mocks (relay connection)
            (webCore.getTokenSignature as jest.Mock).mockResolvedValueOnce({
                originToken: { identityToken: 'new-relay-token' },
            });

            const result = await adapter.request('test.action', { foo: 'bar' });

            expect(result).toBe('success-response');
            expect(mockClient.request).toHaveBeenCalledTimes(3);

            // 1. First call of test.action
            expect(mockClient.request).toHaveBeenNthCalledWith(1, 'test.action', { foo: 'bar' }, undefined);
            // 2. auth.update with the new token
            expect(mockClient.request).toHaveBeenNthCalledWith(
                2,
                'auth.update',
                { token: 'new-relay-token' },
                undefined
            );
            // 3. Retry of test.action
            expect(mockClient.request).toHaveBeenNthCalledWith(3, 'test.action', { foo: 'bar' }, undefined);
        });

        it('should use cloud token refresh if config is cloud type', async () => {
            // Set config to cloud
            mockManager.getActiveConfig.mockReturnValueOnce({
                url: 'wss://cloud.url',
                deviceId: 'device-123',
                wssType: 'cloud',
            });

            const err401 = new Error('401 UNAUTHORIZED');
            mockClient.request
                .mockRejectedValueOnce(err401)
                .mockResolvedValueOnce({ status: 'ok' }) // auth.update
                .mockResolvedValueOnce('success-response'); // retry

            // Setup cloudCore token mocks
            (cloudCore.refreshToken as jest.Mock).mockResolvedValueOnce(undefined);
            (cloudCore.getIdentityToken as jest.Mock).mockReturnValueOnce('new-cloud-token');

            const result = await adapter.request('test.action', { foo: 'bar' });

            expect(result).toBe('success-response');
            expect(cloudCore.refreshToken).toHaveBeenCalledTimes(1);
            expect(cloudCore.getIdentityToken).toHaveBeenCalledTimes(1);
            expect(mockClient.request).toHaveBeenNthCalledWith(
                2,
                'auth.update',
                { token: 'new-cloud-token' },
                undefined
            );
        });

        it('should NOT retry if auth.update itself fails with 401', async () => {
            const err401 = new Error('401 UNAUTHORIZED');
            mockClient.request.mockRejectedValue(err401);

            (webCore.getTokenSignature as jest.Mock).mockResolvedValue({
                originToken: { identityToken: 'new-relay-token' },
            });

            await expect(adapter.request('auth.update', { token: 'old-token' })).rejects.toThrow('401 UNAUTHORIZED');
            expect(mockClient.request).toHaveBeenCalledTimes(1); // No retry
        });
    });

    describe('503 SOCKET NOT CONNECTED retry', () => {
        it('should wait for socket state to become connected and retry', async () => {
            mockClient.state = 'connecting'; // initially not connected

            const err503 = new Error('503 SOCKET NOT CONNECTED');
            mockClient.request.mockRejectedValueOnce(err503).mockResolvedValueOnce('success-response');

            // Trigger request
            const requestPromise = adapter.request('test.action', { foo: 'bar' });

            // Wait brief moment, then simulate transition to connected
            await new Promise(resolve => setTimeout(resolve, 50));
            mockClient.state = 'connected';
            activeClientStateListener?.('connected');

            const result = await requestPromise;

            expect(result).toBe('success-response');
            expect(mockClient.request).toHaveBeenCalledTimes(2);
        });

        it('should fail if socket does not connect within timeout', async () => {
            mockClient.state = 'connecting';
            const err503 = new Error('503 SOCKET NOT CONNECTED');
            mockClient.request.mockRejectedValue(err503);

            jest.useFakeTimers();

            const requestPromise = adapter.request('test.action', { foo: 'bar' });

            // Fast-forward timers by 10s to trigger timeout
            await Promise.resolve(); // allow start of execution
            jest.advanceTimersByTime(10000);

            await expect(requestPromise).rejects.toThrow('503 SOCKET NOT CONNECTED');
            expect(mockClient.request).toHaveBeenCalledTimes(1); // No retry

            jest.useRealTimers();
        });
    });
});
