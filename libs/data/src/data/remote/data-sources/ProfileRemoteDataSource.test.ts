import { ProfileRemoteDataSource } from './ProfileRemoteDataSource';
import { createMockRemoteGateways, type MockRemoteGatewayBundle } from '../gateways/__mocks__/MockRemoteGateways';
import type {
    ProfileGetInput,
    ProfileGetMineInput,
    ProfileSetInput,
    ProfileSyncInput,
} from '@lemoncloud/chatic-sockets-lib';

describe('ProfileRemoteDataSource', () => {
    let mockGateways: MockRemoteGatewayBundle;
    let dataSource: ProfileRemoteDataSource;

    beforeEach(() => {
        mockGateways = createMockRemoteGateways();
        dataSource = new ProfileRemoteDataSource(mockGateways.profile);
    });

    it('get 호출 시 profile.get 액션으로 request가 전송되어야 한다', async () => {
        const payload: ProfileGetInput = { id: 'site-1:user-1' };
        mockGateways.profile.get.mockResolvedValue({ siteId: 'site-1', userId: 'user-1', nick: 'nick-1' } as any);

        const result = await dataSource.get(payload);

        expect(mockGateways.profile.get).toHaveBeenCalledWith(payload);
        expect(result).toEqual({ siteId: 'site-1', userId: 'user-1', nick: 'nick-1' });
    });

    it('getMine 호출 시 profile.get-mine 액션으로 request가 전송되어야 한다', async () => {
        const payload: ProfileGetMineInput = {};
        mockGateways.profile.getMine.mockResolvedValue({ siteId: 'site-1', userId: 'me', nick: 'mine' } as any);

        const result = await dataSource.getMine(payload);

        expect(mockGateways.profile.getMine).toHaveBeenCalledWith(payload);
        expect(result).toEqual({ siteId: 'site-1', userId: 'me', nick: 'mine' });
    });

    it('set 호출 시 profile.set 액션으로 request가 전송되어야 한다', async () => {
        const payload: ProfileSetInput = { siteId: 'site-1', userId: 'me', nick: 'nick-2' } as any;
        mockGateways.profile.set.mockResolvedValue({ siteId: 'site-1', userId: 'me', nick: 'nick-2' } as any);

        const result = await dataSource.set(payload);

        expect(mockGateways.profile.set).toHaveBeenCalledWith(payload);
        expect(result).toEqual({ siteId: 'site-1', userId: 'me', nick: 'nick-2' });
    });

    it('sync 호출 시 profile.sync 액션으로 request가 전송되어야 한다', async () => {
        const payload: ProfileSyncInput = { since: 10 };
        mockGateways.profile.sync.mockResolvedValue({ profiles: {}, syncedAt: 10 } as any);

        const result = await dataSource.sync(payload);

        expect(mockGateways.profile.sync).toHaveBeenCalledWith(payload);
        expect(result).toEqual({ profiles: {}, syncedAt: 10 });
    });
});
