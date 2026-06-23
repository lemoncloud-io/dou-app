import { ProfileRepository } from './ProfileRepository';
import type { UserGetSiteProfileInput, UserSetSiteProfileInput } from '@lemoncloud/chatic-sockets-api';

describe('ProfileRepository', () => {
    const createRepository = () => {
        const remote = {
            getMine: jest.fn().mockResolvedValue({ siteId: 'site-1', nick: 'nick-1' }),
            set: jest.fn().mockResolvedValue({ siteId: 'site-1', nick: 'nick-2' }),
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

    it('getSiteProfile 호출 시 remoteDataSource.getMine를 호출해야 한다', async () => {
        const { repository, remote } = createRepository();
        const payload: UserGetSiteProfileInput = {};

        const result = await repository.getSiteProfile(payload);

        expect(remote.getMine).toHaveBeenCalledWith(payload);
        expect(result).toEqual({ siteId: 'site-1', nick: 'nick-1' });
    });

    it('setSiteProfile 호출 시 remoteDataSource.set를 호출해야 한다', async () => {
        const { repository, remote } = createRepository();
        const payload: UserSetSiteProfileInput = { nick: 'nick-2' };

        const result = await repository.setSiteProfile(payload);

        expect(remote.set).toHaveBeenCalledWith(payload);
        expect(result).toEqual({ siteId: 'site-1', nick: 'nick-2' });
    });
});
