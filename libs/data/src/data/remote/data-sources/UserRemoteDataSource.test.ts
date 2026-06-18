import { UserRemoteDataSource } from './UserRemoteDataSource';
import { createMockRemoteGateways, type MockRemoteGatewayBundle } from '../gateways/__mocks__/MockRemoteGateways';
import type { IEventBus } from '../../events/eventBus';
import type { DomainEventMap } from '../../events/domain';
import type {
    ChatUsersInput,
    UserUpdateProfileInput,
    UserInviteInput,
    UserInviteBatchInput,
    ChannelSyncUsersInput,
    ChannelSyncSiteProfileInput,
} from '@lemoncloud/chatic-sockets-api';

describe('UserRemoteDataSource', () => {
    let mockGateways: MockRemoteGatewayBundle;
    let mockDomainEventBus: jest.Mocked<IEventBus<DomainEventMap>>;
    let dataSource: UserRemoteDataSource;

    beforeEach(() => {
        mockGateways = createMockRemoteGateways();
        mockDomainEventBus = {
            emit: jest.fn(),
            on: jest.fn(),
            onAny: jest.fn(),
        } as unknown as jest.Mocked<IEventBus<DomainEventMap>>;

        dataSource = new UserRemoteDataSource(mockDomainEventBus, mockGateways.user);
    });

    it('fetchUsers 호출 시 channel.list-user 액션으로 request가 전송되어야 한다', async () => {
        const payload: ChatUsersInput = { channelId: 'ch-1' } as any;
        await dataSource.fetchUsers(payload);
        expect(mockGateways.user.listUser).toHaveBeenCalledWith(payload);
    });

    it('updateProfile 호출 시 user.update-profile 액션으로 request가 전송되어야 한다', async () => {
        const payload: UserUpdateProfileInput = { name: 'New Name' };
        await dataSource.updateProfile(payload);
        expect(mockGateways.user.updateProfile).toHaveBeenCalledWith(payload);
    });

    it('requestInvite 호출 시 user.invite 액션으로 request가 전송되어야 한다', async () => {
        const payload: UserInviteInput = { name: 'Guest', phone: '01012345678' };
        await dataSource.requestInvite(payload);
        expect(mockGateways.user.invite).toHaveBeenCalledWith(payload);
    });

    it('inviteBatch 호출 시 user.invite-batch 액션으로 request가 전송되어야 한다', async () => {
        const payload: UserInviteBatchInput = { to: ['01012345678'] };
        await dataSource.inviteBatch(payload);
        expect(mockGateways.user.inviteBatch).toHaveBeenCalledWith(payload);
    });

    it('syncChannelUsers 호출 시 channel.sync-users 액션으로 request가 전송되어야 한다', async () => {
        const payload: ChannelSyncUsersInput = { channelId: 'ch-1' };
        await dataSource.syncChannelUsers(payload);
        expect(mockGateways.user.syncUsers).toHaveBeenCalledWith(payload);
    });

    it('syncSiteProfile 호출 시 channel.sync-site-profile 액션으로 request가 전송되어야 한다', async () => {
        const payload: ChannelSyncSiteProfileInput = {};
        await dataSource.syncSiteProfile(payload);
        expect(mockGateways.user.syncProfile).toHaveBeenCalledWith(payload);
    });

    it('handleModelEvent("create", data) 호출 시 user:create를 emit 해야 한다', () => {
        const data = { id: 'u-1', name: 'Raine' };
        dataSource.handleModelEvent('create', data);
        expect(mockDomainEventBus.emit).toHaveBeenCalledWith('user:create', { data });
    });
});
