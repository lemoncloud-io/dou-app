import { ChatRemoteDataSource } from './ChatRemoteDataSource';
import type { IEventBus } from '../../events/eventBus';
import type { DomainEventMap, SocketEventMap } from '../../events/types';
import type { IWebSocketClient } from '../clients';
import type { ChatSendPayload } from '@lemoncloud/chatic-sockets-api';
import type { ChatView } from '@lemoncloud/chatic-socials-api';

describe('ChatRemoteDataSource', () => {
    let mockSocketEventBus: jest.Mocked<IEventBus<SocketEventMap>>;
    let mockDomainEventBus: jest.Mocked<IEventBus<DomainEventMap>>;
    let mockWssClient: jest.Mocked<IWebSocketClient>;
    let dataSource: ChatRemoteDataSource;

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

        mockDomainEventBus = {
            emit: jest.fn(),
        } as unknown as jest.Mocked<IEventBus<DomainEventMap>>;

        mockWssClient = { send: jest.fn() } as unknown as jest.Mocked<IWebSocketClient>;

        dataSource = new ChatRemoteDataSource(mockSocketEventBus, mockDomainEventBus, mockWssClient);
    });

    it('chat:create 수신 시 데이터 모델을 { data, ref, cid } 형태로 래핑하여 emit 해야 한다', () => {
        const mockDetail = {
            cid: 'c-1',
            ref: 'r-1',
            payload: { id: 'msg-1', text: 'hello' } as ChatView,
        };

        socketCallbacks['chat:create'](mockDetail);

        expect(mockDomainEventBus.emit).toHaveBeenCalledWith('chat:create', {
            data: mockDetail.payload,
            ref: 'r-1',
            cid: 'c-1',
        });
    });

    it('sendChat 호출 시 주입된 ref를 포함하여 wssClient.send를 호출해야 한다', () => {
        const payload: ChatSendPayload = {
            channelId: 'ch-1',
            content: 'hello',
            contentType: 'text',
        };
        const mockRef = 'custom-ref-123';

        dataSource.sendChat(payload, mockRef);

        expect(mockWssClient.send).toHaveBeenCalledWith('chat', 'send', payload, mockRef);
    });

    it('chat:error 수신 시 에러 전용 포맷으로 변환하여 emit 해야 한다', () => {
        const mockDetail = {
            cid: 'c-1',
            ref: 'err-ref',
            payload: { error: 'Message blocked' },
        };

        socketCallbacks['chat:error'](mockDetail);

        expect(mockDomainEventBus.emit).toHaveBeenCalledWith('error', {
            domain: 'chat',
            message: 'Message blocked',
            ref: 'err-ref',
        });
    });
});
