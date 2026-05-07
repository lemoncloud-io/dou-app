import { SiteRepository } from './SiteRepository';

describe('SiteRepository', () => {
    const payload = {} as any;

    const createRepository = ({ localResult }: { localResult: any | null }) => {
        const remote = {
            fetchSite: jest.fn(),
            createSite: jest.fn(),
            updateSite: jest.fn(),
        };

        const local = {
            fetchSite: jest.fn(async () => localResult),
            upsertSite: jest.fn(),
            upsertSites: jest.fn(),
            replaceSites: jest.fn(),
            deleteSite: jest.fn(),
            deleteSites: jest.fn(),
            updateSitePartial: jest.fn(),
            clearAll: jest.fn(),
            subscribeSites: jest.fn(() => () => undefined),
            subscribeSite: jest.fn(() => () => undefined),
        };

        const requestManager = {
            request: jest.fn(async (sendAction: (ref: string) => void) => {
                sendAction('ref-1');
                return {
                    list: [{ id: 's1', cid: 'cloud-a' }],
                    total: 1,
                };
            }),
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

        const repository = new SiteRepository(
            remote as any,
            local as any,
            requestManager as any,
            contextProvider,
            domainEventBus as any
        );

        return { repository, remote, local, requestManager };
    };

    it('returns local first for cache-first and runs remote refresh in background', async () => {
        const localResult = { list: [{ id: 's-local' }], total: 1 };
        const { repository, remote, requestManager } = createRepository({ localResult });

        const result = await repository.fetchSite(payload, { cachePolicy: 'cache-first' });

        expect(result).toEqual(localResult);
        await Promise.resolve();
        expect(remote.fetchSite).toHaveBeenCalledTimes(1);
        expect(requestManager.request).toHaveBeenCalledTimes(1);
    });

    it('delegates subscribeSites to local data source with repository context', () => {
        const { repository, local } = createRepository({ localResult: null });
        const callback = jest.fn();

        repository.subscribeSites(payload, callback);

        expect(local.subscribeSites).toHaveBeenCalledWith(payload, callback, {
            cid: 'cloud-a',
            uid: 'user-a',
        });
    });

    it('delegates clearAll to local data source with repository context', async () => {
        const { repository, local } = createRepository({ localResult: null });

        await repository.clearAll();

        expect(local.clearAll).toHaveBeenCalledWith({ cid: 'cloud-a', uid: 'user-a' });
    });
});
