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
        const payload: ChatInvitePayload = { channelId: 'ch-1', userIds: ['u-1'] };
        dataSource.inviteUser(payload, 'ref-invite');

        expect(mockWssClient.send).toHaveBeenCalledWith('chat', 'invite', payload, 'ref-invite');
    });

    it('updateProfile 호출 시 user 도메인의 update-profile 액션으로 전송되어야 한다', () => {
        const payload = { name: 'Raine' };
        dataSource.updateProfile(payload, 'ref-profile');

        expect(mockWssClient.send).toHaveBeenCalledWith('user', 'update-profile', payload, 'ref-profile');
    });

    it('requestInvite 호출 시 user 도메인의 invite 액션으로 전송되어야 한다', () => {
        const payload = { name: 'Guest', phone: '01012345678', channelId: 'ch-1' };
        dataSource.requestInvite(payload, 'ref-request-invite');

        expect(mockWssClient.send).toHaveBeenCalledWith('user', 'invite', payload, 'ref-request-invite');
    });

    it('user:create 수신 시 user:create 로 정제하여 발행해야 한다', () => {
        const mockDetail = { cid: 'c-1', ref: 'r-create', payload: { id: 'user-1', name: 'Guest' } };
        socketCallbacks['user:create'](mockDetail);

        expect(mockDomainEventBus.emit).toHaveBeenCalledWith('user:create', {
            data: mockDetail.payload,
            ref: 'r-create',
            cid: 'c-1',
        });
    });
});
