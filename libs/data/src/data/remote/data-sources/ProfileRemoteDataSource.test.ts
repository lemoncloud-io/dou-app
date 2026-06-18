import { ProfileRemoteDataSource } from './ProfileRemoteDataSource';
import { createMockRemoteGateways, type MockRemoteGatewayBundle } from '../gateways/__mocks__/MockRemoteGateways';
import type { UserGetSiteProfileInput, UserSetSiteProfileInput } from '@lemoncloud/chatic-sockets-api';

describe('ProfileRemoteDataSource', () => {
    let mockGateways: MockRemoteGatewayBundle;
    let dataSource: ProfileRemoteDataSource;

    beforeEach(() => {
        mockGateways = createMockRemoteGateways();
        dataSource = new ProfileRemoteDataSource(mockGateways.profile);
    });

    it('getSiteProfile 호출 시 user.get-site-profile 액션으로 request가 전송되어야 한다', async () => {
        const payload: UserGetSiteProfileInput = {};
        mockGateways.profile.getSiteProfile.mockResolvedValue({ siteId: 'site-1', nick: 'nick-1' } as any);

        const result = await dataSource.getSiteProfile(payload);

        expect(mockGateways.profile.getSiteProfile).toHaveBeenCalledWith(payload);
        expect(result).toEqual({ siteId: 'site-1', nick: 'nick-1' });
    });

    it('setSiteProfile 호출 시 user.set-site-profile 액션으로 request가 전송되어야 한다', async () => {
        const payload: UserSetSiteProfileInput = { nick: 'nick-2' };
        mockGateways.profile.setSiteProfile.mockResolvedValue({ siteId: 'site-1', nick: 'nick-2' } as any);

        const result = await dataSource.setSiteProfile(payload);

        expect(mockGateways.profile.setSiteProfile).toHaveBeenCalledWith(payload);
        expect(result).toEqual({ siteId: 'site-1', nick: 'nick-2' });
    });
});
