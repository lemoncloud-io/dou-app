import { ProfileRemoteDataSource } from './ProfileRemoteDataSource';
import { MockSocketClient } from '../sockets/__mocks__/MockSocketClient';
import type { UserGetSiteProfileInput, UserSetSiteProfileInput } from '@lemoncloud/chatic-sockets-api';

describe('ProfileRemoteDataSource', () => {
    let mockClient: MockSocketClient;
    let dataSource: ProfileRemoteDataSource;

    beforeEach(() => {
        mockClient = new MockSocketClient();
        dataSource = new ProfileRemoteDataSource(mockClient);
    });

    it('getSiteProfile 호출 시 user.get-site-profile 액션으로 request가 전송되어야 한다', async () => {
        const payload: UserGetSiteProfileInput = {};
        mockClient.request.mockResolvedValue({ siteId: 'site-1', nick: 'nick-1' });

        const result = await dataSource.getSiteProfile(payload);

        expect(mockClient.request).toHaveBeenCalledWith('user.get-site-profile', payload);
        expect(result).toEqual({ siteId: 'site-1', nick: 'nick-1' });
    });

    it('setSiteProfile 호출 시 user.set-site-profile 액션으로 request가 전송되어야 한다', async () => {
        const payload: UserSetSiteProfileInput = { nick: 'nick-2' };
        mockClient.request.mockResolvedValue({ siteId: 'site-1', nick: 'nick-2' });

        const result = await dataSource.setSiteProfile(payload);

        expect(mockClient.request).toHaveBeenCalledWith('user.set-site-profile', payload);
        expect(result).toEqual({ siteId: 'site-1', nick: 'nick-2' });
    });
});
