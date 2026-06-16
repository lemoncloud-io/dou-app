import { JoinRepository } from './JoinRepository';

describe('JoinRepository local-only fetchJoins', () => {
    const createRepository = () => {
        const remote = { readChat: jest.fn(), updateJoin: jest.fn() };
        const local = {
            fetchList: jest.fn(),
            getById: jest.fn(),
            upsert: jest.fn(),
            upsertMany: jest.fn(),
            remove: jest.fn(),
            removeMany: jest.fn(),
            clearAll: jest.fn(),
            subscribeList: jest.fn(() => () => undefined),
            subscribeItem: jest.fn(() => () => undefined),
        };

        const requestManager = {
            request: jest.fn(async (sendAction: (ref: string) => void) => {
                sendAction('ref-1');
                return {};
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

        const repository = new JoinRepository(
            remote as any,
            local as any,
            requestManager as any,
            contextProvider,
            domainEventBus as any
        );

        return { repository, local, requestManager };
    };

    it('returns local joins for cache-first without remote call', async () => {
        const { repository, local, requestManager } = createRepository();
        const mockResult = { list: [{ id: 'j-1', channelId: 'ch-1', joined: 1 }], meta: { total: 1, source: 'local' } };
        local.fetchList.mockResolvedValue(mockResult);

        const result = await repository.fetchJoins({ channelId: 'ch-1' }, { cachePolicy: 'cache-first' });

        expect(local.fetchList).toHaveBeenCalledWith({ channelId: 'ch-1' }, { cid: 'cloud-a', uid: 'user-a' });
        expect(result).toMatchObject(mockResult);
        expect(requestManager.request).not.toHaveBeenCalled();
    });

    it('uses active join local query when activeOnly is true', async () => {
        const { repository, local } = createRepository();
        const mockResult = { list: [{ id: 'j-2', channelId: 'ch-1', joined: 1 }], meta: { total: 1, source: 'local' } };
        local.fetchList.mockResolvedValue(mockResult);

        const result = await repository.fetchJoins({ channelId: 'ch-1', activeOnly: true });

        // Data Source 단으로 activeOnly 필터링 책임을 모두 넘겼는지 확인
        expect(local.fetchList).toHaveBeenCalledWith(
            { channelId: 'ch-1', activeOnly: true },
            { cid: 'cloud-a', uid: 'user-a' }
        );
        expect(result).toMatchObject(mockResult);
    });

    it('returns fallback for cache-only when local is empty', async () => {
        const { repository, local, requestManager } = createRepository();
        local.fetchList.mockResolvedValue(null);

        const result = await repository.fetchJoins({ channelId: 'ch-1' }, { cachePolicy: 'cache-only' });

        expect(result.list).toEqual([]);
        expect(result.meta.total).toBe(0);
        expect(requestManager.request).not.toHaveBeenCalled();
    });

    it('throws when remote fetch is required but fetchJoins is local-only', async () => {
        const { repository, local } = createRepository();
        local.fetchList.mockResolvedValue({ list: [], meta: { total: 0 } });

        await expect(repository.fetchJoins({ channelId: 'ch-1' }, { cachePolicy: 'network-only' })).rejects.toThrow(
            '[JoinRepository] fetchJoins is local-only and does not support remote fetch (cachePolicy=network-only).'
        );
    });
});
