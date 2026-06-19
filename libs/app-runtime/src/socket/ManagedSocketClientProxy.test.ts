import { ManagedSocketClientProxy } from './ManagedSocketClientProxy';
import type { SocketSessionController } from './SocketSessionController';
import type { ISocketManager } from './types';
import type { ClientSocketV2 } from '@lemoncloud/chatic-sockets-lib';

describe('ManagedSocketClientProxy', () => {
    let manager: jest.Mocked<ISocketManager>;
    let client: jest.Mocked<ClientSocketV2>;
    let controller: jest.Mocked<SocketSessionController>;
    let proxy: ManagedSocketClientProxy;

    beforeEach(() => {
        client = {
            request: jest.fn(),
            send: jest.fn(),
            onType: jest.fn(),
            onState: jest.fn(),
            onError: jest.fn(),
            onMessage: jest.fn(),
            destroy: jest.fn(),
            state: 'connected',
        } as unknown as jest.Mocked<ClientSocketV2>;

        manager = {
            ensure: jest.fn(),
            getClient: jest.fn().mockReturnValue(client),
            subscribeClient: jest.fn().mockReturnValue(jest.fn()),
            getSnapshot: jest.fn(),
            subscribe: jest.fn(),
            markUnverified: jest.fn(),
            connect: jest.fn(),
            destroy: jest.fn(),
        } as unknown as jest.Mocked<ISocketManager>;

        controller = {
            handle401Recovery: jest.fn(),
        } as unknown as jest.Mocked<SocketSessionController>;

        proxy = new ManagedSocketClientProxy(manager, controller);
    });

    it('성공적인 request()는 결과를 그대로 반환해야 한다', async () => {
        client.request.mockResolvedValueOnce('response-data');

        const result = await proxy.request('test.type', { foo: 'bar' });

        expect(client.request).toHaveBeenCalledWith('test.type', { foo: 'bar' }, undefined);
        expect(result).toBe('response-data');
    });

    it('401 에러 시 handle401Recovery를 호출하고 복구 완료 시 재시도 성공해야 한다', async () => {
        const error401 = { errorCode: 401, message: 'UNAUTHORIZED' };
        client.request.mockRejectedValueOnce(error401).mockResolvedValueOnce('retry-success-data');

        controller.handle401Recovery.mockResolvedValueOnce(true);

        const result = await proxy.request('test.type', { foo: 'bar' });

        expect(client.request).toHaveBeenCalledTimes(2);
        expect(controller.handle401Recovery).toHaveBeenCalled();
        expect(result).toBe('retry-success-data');
    });

    it('401 에러 복구가 실패했을 때 원래 에러를 throw 해야 한다', async () => {
        const error401 = { errorCode: 401, message: 'UNAUTHORIZED' };
        client.request.mockRejectedValueOnce(error401);
        controller.handle401Recovery.mockResolvedValueOnce(false);

        await expect(proxy.request('test.type')).rejects.toEqual(error401);
        expect(client.request).toHaveBeenCalledTimes(1);
    });
});
