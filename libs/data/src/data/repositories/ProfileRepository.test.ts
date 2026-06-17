import { ProfileRepository } from './ProfileRepository';
import type { UserGetSiteProfileInput, UserSetSiteProfileInput } from '@lemoncloud/chatic-sockets-api';

describe('ProfileRepository', () => {
    const createRepository = () => {
        const remote = {
            getSiteProfile: jest.fn().mockResolvedValue({ siteId: 'site-1', nick: 'nick-1' }),
            setSiteProfile: jest.fn().mockResolvedValue({ siteId: 'site-1', nick: 'nick-2' }),
        };

        const contextProvider = {
            getContext: () => ({ cid: 'cloud-a', uid: 'user-a' }),
            setContext: () => undefined,
        };

        const domainEventBus = {
            on: jest.fn(() => () => undefined),
            emit: jest.fn(),
            onAny: jest.fn(() => () => undefined),
        };

        const repository = new ProfileRepository(remote as any, contextProvider, domainEventBus as any);

        return { repository, remote };
    };

    it('getSiteProfile 호출 시 remoteDataSource.getSiteProfile를 호출해야 한다', async () => {
        const { repository, remote } = createRepository();
        const payload: UserGetSiteProfileInput = {};

        const result = await repository.getSiteProfile(payload);

        expect(remote.getSiteProfile).toHaveBeenCalledWith(payload);
        expect(result).toEqual({ siteId: 'site-1', nick: 'nick-1' });
    });

    it('setSiteProfile 호출 시 remoteDataSource.setSiteProfile를 호출해야 한다', async () => {
        const { repository, remote } = createRepository();
        const payload: UserSetSiteProfileInput = { nick: 'nick-2' };

        const result = await repository.setSiteProfile(payload);

        expect(remote.setSiteProfile).toHaveBeenCalledWith(payload);
        expect(result).toEqual({ siteId: 'site-1', nick: 'nick-2' });
    });
});
