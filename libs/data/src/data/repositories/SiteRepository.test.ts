import { SiteRepository } from './SiteRepository';

describe('SiteRepository', () => {
    const payload = {} as any;

    const createRepository = ({ localResult }: { localResult: any | null }) => {
        const remote = {
            fetchSite: jest.fn().mockResolvedValue({
                list: [{ id: 's1', cid: 'cloud-a' }],
                total: 1,
            }),
            createSite: jest.fn(),
            updateSite: jest.fn(),
            handleModelEvent: jest.fn(),
        };

        const local = {
            fetchList: jest.fn(async () => localResult),
            getById: jest.fn(),
            upsert: jest.fn(),
            upsertMany: jest.fn(),
            replaceSites: jest.fn(),
            remove: jest.fn(),
            removeMany: jest.fn(),
            clearAll: jest.fn(),
            subscribeList: jest.fn(() => () => undefined),
            subscribeItem: jest.fn(() => () => undefined),
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

        const repository = new SiteRepository(remote as any, local as any, contextProvider, domainEventBus as any);

        return { repository, remote, local };
    };

    it('returns local first for cache-first and runs remote refresh in background', async () => {
        const localResult = { list: [{ id: 's-local' }], meta: { total: 1, source: 'local' } };
        const { repository, remote } = createRepository({ localResult });

        const result = await repository.fetchSite(payload, { cachePolicy: 'cache-first' });

        expect(result).toEqual(localResult);
        await Promise.resolve();
        expect(remote.fetchSite).toHaveBeenCalledTimes(1);
    });

    it('delegates subscribeList to local data source with repository context', () => {
        const { repository, local } = createRepository({ localResult: null });
        const callback = jest.fn();

        repository.subscribeList(payload, callback);

        expect(local.subscribeList).toHaveBeenCalledWith(payload, callback, {
            cid: 'cloud-a',
            uid: 'user-a',
        });
    });
});
