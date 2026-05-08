import { JoinRepository } from './JoinRepository';

describe('JoinRepository local-only fetchJoins', () => {
    const createRepository = () => {
        const remote = {
            readChat: jest.fn(),
            updateJoin: jest.fn(),
        };

        const local = {
            getJoin: jest.fn(),
            getJoinsByChannel: jest.fn(),
            getActiveJoinsByChannel: jest.fn(),
            upsertJoin: jest.fn(),
            upsertJoins: jest.fn(),
            deleteJoin: jest.fn(),
            deleteJoins: jest.fn(),
            updateJoinPartial: jest.fn(),
            clearAll: jest.fn(),
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
        const localJoins = [{ id: 'j-1', channelId: 'ch-1', joined: 1 }];
        local.getJoinsByChannel.mockResolvedValue(localJoins);

        const result = await repository.fetchJoins({ channelId: 'ch-1' }, { cachePolicy: 'cache-first' });

        expect(local.getJoinsByChannel).toHaveBeenCalledWith('ch-1', { cid: 'cloud-a', uid: 'user-a' });
        expect(result).toMatchObject({ list: localJoins, total: 1, meta: { totalCount: 1, source: 'local' } });
        expect(requestManager.request).not.toHaveBeenCalled();
    });

    it('uses active join local query when activeOnly is true', async () => {
        const { repository, local } = createRepository();
        const activeJoins = [{ id: 'j-2', channelId: 'ch-1', joined: 1 }];
        local.getActiveJoinsByChannel.mockResolvedValue(activeJoins);

        const result = await repository.fetchJoins({ channelId: 'ch-1', activeOnly: true });

        expect(local.getActiveJoinsByChannel).toHaveBeenCalledWith('ch-1', { cid: 'cloud-a', uid: 'user-a' });
        expect(local.getJoinsByChannel).not.toHaveBeenCalled();
        expect(result).toMatchObject({ list: activeJoins, total: 1, meta: { totalCount: 1, source: 'local' } });
    });

    it('returns fallback for cache-only when local is empty', async () => {
        const { repository, local, requestManager } = createRepository();
        local.getJoinsByChannel.mockResolvedValue([]);

        const result = await repository.fetchJoins({ channelId: 'ch-1' }, { cachePolicy: 'cache-only' });

        expect(result).toMatchObject({ list: [], total: 0, meta: { totalCount: 0, source: 'local' } });
        expect(requestManager.request).not.toHaveBeenCalled();
    });

    it('throws when remote fetch is required but fetchJoins is local-only', async () => {
        const { repository, local } = createRepository();
        local.getJoinsByChannel.mockResolvedValue([]);

        await expect(repository.fetchJoins({ channelId: 'ch-1' }, { cachePolicy: 'network-only' })).rejects.toThrow(
            '[JoinRepository] fetchJoins is local-only and does not support remote fetch (cachePolicy=network-only).'
        );

        await expect(repository.fetchJoins({ channelId: 'ch-1' }, { cachePolicy: 'cache-first' })).rejects.toThrow(
            '[JoinRepository] fetchJoins is local-only and does not support remote fetch (cachePolicy=cache-first).'
        );
    });

    it('delegates clearAll to local data source with repository context', async () => {
        const { repository, local } = createRepository();

        await repository.clearAll();

        expect(local.clearAll).toHaveBeenCalledWith({ cid: 'cloud-a', uid: 'user-a' });
    });
});
