import { JoinRemoteDataSource } from './JoinRemoteDataSource';
import type { IEventBus } from '../../events/eventBus';
import type { DomainEventMap, SocketEventMap } from '../../events/types';
import type { IWebSocketClient } from '../clients';
import type { ChatReadPayload } from '@lemoncloud/chatic-sockets-api';

describe('JoinRemoteDataSource', () => {
    let mockSocketEventBus: jest.Mocked<IEventBus<SocketEventMap>>;
    let mockDomainEventBus: jest.Mocked<IEventBus<DomainEventMap>>;
    let mockWssClient: jest.Mocked<IWebSocketClient>;
    let dataSource: JoinRemoteDataSource;
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

        dataSource = new JoinRemoteDataSource(mockSocketEventBus, mockDomainEventBus, mockWssClient);
    });

    it('chat:read 소켓 이벤트가 도메인의 join:update 로 통합 매핑되어야 한다', () => {
        const mockDetail = { cid: 'c-1', ref: 'r-1', payload: { id: 'join-1' } };
        socketCallbacks['chat:read'](mockDetail);

        expect(mockDomainEventBus.emit).toHaveBeenCalledWith('join:update', {
            data: mockDetail.payload,
            ref: 'r-1',
            cid: 'c-1',
        });
    });

    it('readChat 호출 시 chat 도메인의 read 액션으로 전송되어야 한다', () => {
        const payload: ChatReadPayload = { channelId: 'ch-1', messageId: 'msg-1' } as any;
        dataSource.readChat(payload, 'ref-read');

        expect(mockWssClient.send).toHaveBeenCalledWith('chat', 'read', payload, 'ref-read');
    });
});
