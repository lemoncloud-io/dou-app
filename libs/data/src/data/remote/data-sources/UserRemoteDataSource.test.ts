import { UserRemoteDataSource } from './UserRemoteDataSource';
import type { IEventBus } from '../../events/eventBus';
import type { DomainEventMap, SocketEventMap } from '../../events/types';
import type { IWebSocketClient } from '../clients';
import type { ChatInvitePayload, ChatUsersPayload } from '@lemoncloud/chatic-sockets-api';

describe('UserRemoteDataSource', () => {
    let mockSocketEventBus: jest.Mocked<IEventBus<SocketEventMap>>;
    let mockDomainEventBus: jest.Mocked<IEventBus<DomainEventMap>>;
    let mockWssClient: jest.Mocked<IWebSocketClient>;
    let dataSource: UserRemoteDataSource;
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

        dataSource = new UserRemoteDataSource(mockSocketEventBus, mockDomainEventBus, mockWssClient);
    });

    it('fetchUsers 호출 시 chat 도메인의 users 액션으로 전송되어야 한다', () => {
        const payload: ChatUsersPayload = { channelId: 'ch-1' } as any;
        dataSource.fetchUsers(payload, 'ref-users');

        expect(mockWssClient.send).toHaveBeenCalledWith('chat', 'users', payload, 'ref-users');
    });

    it('inviteUser 호출 시 chat 도메인의 invite 액션으로 전송되어야 한다', () => {
        const payload: ChatInvitePayload = { channelId: 'ch-1', users: ['u-1'] } as any;
        dataSource.inviteUser(payload, 'ref-invite');

        expect(mockWssClient.send).toHaveBeenCalledWith('chat', 'invite', payload, 'ref-invite');
    });
});
