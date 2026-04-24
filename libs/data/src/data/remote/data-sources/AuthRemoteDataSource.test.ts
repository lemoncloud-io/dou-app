import { AuthRemoteDataSource } from './AuthRemoteDataSource';
import type { IEventBus } from '../../events/eventBus';
import type { DomainEventMap, SocketEventMap } from '../../events/types';
import type { IWebSocketClient } from '../clients';
import type { AuthPayload } from '@lemoncloud/chatic-sockets-api';

describe('AuthRemoteDataSource', () => {
    let mockSocketEventBus: jest.Mocked<IEventBus<SocketEventMap>>;
    let mockDomainEventBus: jest.Mocked<IEventBus<DomainEventMap>>;
    let mockWssClient: jest.Mocked<IWebSocketClient>;
    let dataSource: AuthRemoteDataSource;
    let socketCallbacks: Record<string, (data: any) => void> = {};

    beforeEach(() => {
        socketCallbacks = {};
        mockSocketEventBus = {
            emit: jest.fn(),
            on: jest.fn().mockImplementation((event, callback) => {
                socketCallbacks[event as string] = callback;
                return jest.fn();
            }),
            onAny: jest.fn(),
        } as unknown as jest.Mocked<IEventBus<SocketEventMap>>;

        mockDomainEventBus = { emit: jest.fn() } as unknown as jest.Mocked<IEventBus<DomainEventMap>>;
        mockWssClient = { send: jest.fn() } as unknown as jest.Mocked<IWebSocketClient>;

        dataSource = new AuthRemoteDataSource(mockSocketEventBus, mockDomainEventBus, mockWssClient);
    });

    it('auth:update 이벤트 수신 시 정제하여 emit 해야 한다', () => {
        const mockDetail = { cid: 'c-1', ref: 'r-1', payload: { token: 'abc' } };
        socketCallbacks['auth:update'](mockDetail);

        expect(mockDomainEventBus.emit).toHaveBeenCalledWith('auth:update', {
            data: mockDetail.payload,
            ref: 'r-1',
            cid: 'c-1',
        });
    });

    it('updateSocketAuth 호출 시 올바른 액션으로 전송되어야 한다', () => {
        const payload: AuthPayload = { token: 'new-token' } as any;
        dataSource.updateSocketAuth(payload, 'ref-auth');

        expect(mockWssClient.send).toHaveBeenCalledWith('auth', 'update', payload, 'ref-auth');
    });
});
