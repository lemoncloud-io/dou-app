import { SocketSessionController } from './SocketSessionController';
import type { ISocketManager, SocketSessionDelegate } from './types';
import type { ClientSocketV2 } from '@lemoncloud/chatic-sockets-lib';

const flushPromises = () => new Promise(jest.requireActual('timers').setImmediate);

describe('SocketSessionController', () => {
    let manager: jest.Mocked<ISocketManager>;
    let client: jest.Mocked<ClientSocketV2>;
    let delegate: jest.Mocked<SocketSessionDelegate>;
    let controller: SocketSessionController;

    beforeEach(() => {
        client = {
            connect: jest.fn().mockResolvedValue(undefined),
            request: jest.fn().mockResolvedValue(undefined),
            send: jest.fn(),
            onType: jest.fn(),
            onState: jest.fn(),
            onError: jest.fn(),
            onMessage: jest.fn(),
            destroy: jest.fn(),
        } as unknown as jest.Mocked<ClientSocketV2>;

        manager = {
            ensure: jest.fn().mockReturnValue(client),
            getClient: jest.fn().mockReturnValue(client),
            getSnapshot: jest.fn().mockReturnValue({
                state: 'connected',
                isConnected: true,
                isVerified: false,
                isDeviceRegistered: false,
                connectionId: null,
            }),
            subscribe: jest.fn(),
            subscribeClient: jest.fn(),
            markVerified: jest.fn(),
            markUnverified: jest.fn(),
            markDeviceRegistered: jest.fn(),
            connect: jest.fn().mockResolvedValue(undefined),
            destroy: jest.fn(),
        } as unknown as jest.Mocked<ISocketManager>;

        delegate = {
            getSocketToken: jest.fn().mockResolvedValue('test-token'),
            refreshSocketToken: jest.fn().mockResolvedValue('new-token'),
            onRefreshFailed: jest.fn(),
        };

        controller = new SocketSessionController(manager);
        controller.setDelegate(delegate);

        jest.useFakeTimers();
    });

    afterEach(() => {
        controller.destroy();
        jest.useRealTimers();
    });

    describe('bootstrap', () => {
        it('bootstrap 시 connect, device.save, auth.update 가 올바르게 실행되어야 한다', async () => {
            const config = { url: 'wss://test.com', deviceId: 'device-123', wssType: 'cloud' as const };

            await controller.bootstrap(config);

            expect(manager.ensure).toHaveBeenCalledWith(config);
            expect(manager.connect).toHaveBeenCalled();
            expect(client.request).toHaveBeenCalledWith('device.save', {
                id: 'device-123',
                platform: 'web',
            });
            expect(delegate.getSocketToken).toHaveBeenCalled();
            expect(client.request).toHaveBeenCalledWith('auth.update', { token: 'test-token' });
            // Flags come from request success, not from onType (responses settle by mid).
            expect(manager.markDeviceRegistered).toHaveBeenCalled();
            expect(manager.markVerified).toHaveBeenCalled();
        });

        it('device.save 응답의 connId 를 markDeviceRegistered 로 전달해야 한다', async () => {
            client.request.mockImplementation((type: string) =>
                Promise.resolve(type === 'device.save' ? { connId: 'conn-xyz' } : undefined)
            );

            await controller.bootstrap({ url: 'wss://test.com', deviceId: 'device-123', wssType: 'cloud' as const });

            expect(manager.markDeviceRegistered).toHaveBeenCalledWith('conn-xyz');
        });
    });

    describe('periodic-refresh', () => {
        it('sid가 존재할 때 1분 주기로 auth.update를 실행해야 한다', async () => {
            manager.getSnapshot.mockReturnValue({
                state: 'connected',
                isConnected: true,
                isVerified: true,
                isDeviceRegistered: true,
                connectionId: 'conn-1',
            });

            const config = { url: 'wss://test.com', deviceId: 'device-123', wssType: 'cloud' as const };

            await controller.bootstrap(config);
            jest.clearAllMocks();

            // Fast-forward 1 minute
            jest.advanceTimersByTime(60000);
            await flushPromises();

            expect(delegate.getSocketToken).toHaveBeenCalled();
            expect(client.request).toHaveBeenCalledWith('auth.update', { token: 'test-token' });
        });

        it('sid가 없을 때는 리프레시를 수행하지 않아야 한다', async () => {
            manager.getSnapshot.mockReturnValue({
                state: 'connected',
                isConnected: true,
                isVerified: true,
                isDeviceRegistered: true,
                connectionId: 'conn-1',
            });

            const config = { url: 'wss://test.com', deviceId: 'device-123', wssType: 'cloud' as const };

            await controller.bootstrap(config);
            jest.clearAllMocks();

            // Mock getSocketToken to return null when token refresh is skipped (e.g. no sid)
            delegate.getSocketToken.mockResolvedValueOnce(null);

            // Fast-forward 1 minute
            jest.advanceTimersByTime(60000);
            await flushPromises();

            expect(delegate.getSocketToken).toHaveBeenCalled();
            expect(client.request).not.toHaveBeenCalled();
        });
    });

    describe('401 recovery (single-flight)', () => {
        it('401 복구 시 single-flight promise를 통해 1회만 토큰을 갱신해야 한다', async () => {
            const p1 = controller.handle401Recovery();
            const p2 = controller.handle401Recovery();

            const [r1, r2] = await Promise.all([p1, p2]);

            expect(delegate.refreshSocketToken).toHaveBeenCalledTimes(1);
            expect(client.request).toHaveBeenCalledWith('auth.update', { token: 'new-token' });
            expect(r1).toBe(true);
            expect(r2).toBe(true);
        });

        it('복구 실패 시 onRefreshFailed를 호출하고 false를 반환해야 한다', async () => {
            delegate.refreshSocketToken.mockRejectedValueOnce(new Error('Refresh failed'));

            const result = await controller.handle401Recovery();

            expect(result).toBe(false);
            expect(delegate.onRefreshFailed).toHaveBeenCalled();
        });
    });
});
