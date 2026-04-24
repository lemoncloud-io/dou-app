import { ChannelRemoteDataSource } from './ChannelRemoteDataSource';
import type { IEventBus } from '../../events/eventBus';
import type { DomainEventMap, SocketEventMap } from '../../events/types';
import type { IWebSocketClient } from '../clients';
import type {
    ChatMinePayload,
    ChatUpdateChannelPayload,
    ChatDeleteChannelPayload,
    ChatStartPayload,
    ChatInvitePayload,
} from '@lemoncloud/chatic-sockets-api';
import type { ChannelView } from '@lemoncloud/chatic-socials-api';

describe('ChannelRemoteDataSource', () => {
    let mockSocketEventBus: jest.Mocked<IEventBus<SocketEventMap>>;
    let mockDomainEventBus: jest.Mocked<IEventBus<DomainEventMap>>;
    let mockWssClient: jest.Mocked<IWebSocketClient>;
    let dataSource: ChannelRemoteDataSource;

    let socketCallbacks: Record<string, (data: any) => void> = {};

    beforeEach(() => {
        socketCallbacks = {};

        mockSocketEventBus = {
            emit: jest.fn(),
            on: jest.fn().mockImplementation((event, callback) => {
                socketCallbacks[event as string] = callback;
                return jest.fn(); // unsubscribe dummy
            }),
            onAny: jest.fn(),
        } as unknown as jest.Mocked<IEventBus<SocketEventMap>>;

        mockDomainEventBus = {
            emit: jest.fn(),
            on: jest.fn(),
            onAny: jest.fn(),
        } as unknown as jest.Mocked<IEventBus<DomainEventMap>>;

        // IWebSocketClient 인터페이스 스펙에 맞게 send만 Mocking
        mockWssClient = {
            send: jest.fn(),
        } as unknown as jest.Mocked<IWebSocketClient>;

        dataSource = new ChannelRemoteDataSource(mockSocketEventBus, mockDomainEventBus, mockWssClient);
    });

    describe('수신(Receive) 파이프라인 검증 (Socket -> Domain)', () => {
        it('channel:create 소켓 이벤트 수신 시 domainEventBus 로 매핑하여 emit 해야 한다', () => {
            const mockDetail = {
                cid: 'cloud-1',
                ref: 'ref-1',
                payload: { id: 'ch-1', name: 'General' } as ChannelView,
            };

            socketCallbacks['channel:create'](mockDetail);

            expect(mockDomainEventBus.emit).toHaveBeenCalledWith('channel:create', {
                data: mockDetail.payload,
                ref: 'ref-1',
                cid: 'cloud-1',
            });
        });

        it('channel:error 소켓 이벤트 수신 시 표준 공통 error 규격으로 매핑하여 emit 해야 한다', () => {
            const mockDetail = {
                cid: 'cloud-1',
                ref: 'ref-err',
                payload: { error: 'Not Found' },
            };

            socketCallbacks['channel:error'](mockDetail);

            expect(mockDomainEventBus.emit).toHaveBeenCalledWith('error', {
                domain: 'channel',
                message: 'Not Found',
                ref: 'ref-err',
            });
        });
    });

    describe('발신(Send) 파이프라인 검증 (Domain -> Socket)', () => {
        it('fetchChannel 호출 시 chat 도메인의 mine 액션으로 전송되어야 한다', () => {
            const payload: ChatMinePayload = { limit: 20 } as any;
            dataSource.fetchChannel(payload, 'ref-mine');

            expect(mockWssClient.send).toHaveBeenCalledWith('chat', 'mine', payload, 'ref-mine');
        });

        it('updateChannel 호출 시 chat 도메인의 update-channel 액션으로 전송되어야 한다', () => {
            // TS2741 수정: channelId 필수 규격 준수
            const payload: ChatUpdateChannelPayload = { channelId: 'ch-1', name: 'New Name' } as any;
            dataSource.updateChannel(payload, 'ref-update');

            expect(mockWssClient.send).toHaveBeenCalledWith('chat', 'update-channel', payload, 'ref-update');
        });

        it('deleteChannel 호출 시 chat 도메인의 delete-channel 액션으로 전송되어야 한다', () => {
            const payload: ChatDeleteChannelPayload = { channelId: 'ch-1' } as any;
            dataSource.deleteChannel(payload, 'ref-del');

            expect(mockWssClient.send).toHaveBeenCalledWith('chat', 'delete-channel', payload, 'ref-del');
        });

        it('startChat 호출 시 chat 도메인의 start 액션으로 전송되어야 한다', () => {
            // TS2353 수정: 불필요한 type 속성 제거 후 스펙 준수
            const payload: ChatStartPayload = { users: ['user-1'] } as any;
            dataSource.startChat(payload, 'ref-start');

            expect(mockWssClient.send).toHaveBeenCalledWith('chat', 'start', payload, 'ref-start');
        });

        it('inviteUser 호출 시 chat 도메인의 invite 액션으로 전송되어야 한다', () => {
            const payload: ChatInvitePayload = { channelId: 'ch-1', users: ['user-2'] } as any;
            dataSource.inviteUser(payload, 'ref-invite');

            expect(mockWssClient.send).toHaveBeenCalledWith('chat', 'invite', payload, 'ref-invite');
        });
    });
});
