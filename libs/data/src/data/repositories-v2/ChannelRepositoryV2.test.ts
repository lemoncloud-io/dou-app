import { ChannelRepositoryV2 } from './ChannelRepositoryV2';

describe('ChannelRepositoryV2', () => {
    const createRepository = () => {
        // Mock remote and local collaborators independently so orchestration behavior is easy to assert.
        const channelRemoteDataSource = {
            fetchChannel: jest.fn(),
            syncChannel: jest.fn(),
            createChannel: jest.fn(),
            updateChannel: jest.fn(),
            inviteChannel: jest.fn(),
            leaveChannel: jest.fn(),
            deleteChannel: jest.fn(),
            getSelfChannel: jest.fn(),
            getUnreads: jest.fn(),
        };
        const channelLocalDataSource = {
            observeList: jest.fn(() => () => undefined),
            observeItem: jest.fn(() => () => undefined),
            cacheRead: jest.fn(),
            cacheReadList: jest.fn(),
            cacheWrite: jest.fn(),
            cacheWriteMany: jest.fn(),
            cacheDelete: jest.fn(),
            cacheDeleteMany: jest.fn(),
            cacheClear: jest.fn(),
        };
        const contextProvider = {
            getContext: () => ({ cid: 'cloud-a', sid: 'site-1', uid: 'me' }),
            setContext: () => undefined,
        };

        return {
            repository: new ChannelRepositoryV2(
                channelRemoteDataSource as any,
                channelLocalDataSource as any,
                contextProvider
            ),
            channelRemoteDataSource,
            channelLocalDataSource,
        };
    };

    it('removes stale local channels that the remote refresh no longer returns', async () => {
        const { repository, channelRemoteDataSource, channelLocalDataSource } = createRepository();
        channelRemoteDataSource.fetchChannel.mockResolvedValue({
            list: [{ id: 'ch-1', sid: 'site-1', updatedAt: 100 }],
        });
        channelLocalDataSource.cacheReadList.mockResolvedValue({
            list: [{ id: 'ch-1' }, { id: 'stale' }],
        });

        const result = await repository.refreshList({ sid: 'site-1' } as any);

        // The repository should reconcile the local list against the latest server snapshot.
        expect(channelLocalDataSource.cacheDeleteMany).toHaveBeenCalledWith(['stale'], {
            cid: 'cloud-a',
            sid: 'site-1',
            uid: 'me',
        });
        expect(result).toBeUndefined();
    });

    it('tags the refreshed channels with the viewed sid, not a drifting data-context sid', async () => {
        // channel.mine returns the current session's channels with no sid field; the
        // viewed sid (query.sid) must scope the local write even if the data context
        // has not yet caught up to the newly selected site.
        const channelRemoteDataSource = {
            fetchChannel: jest.fn().mockResolvedValue({ list: [{ id: 'ch-1' }] }),
            syncChannel: jest.fn(),
            createChannel: jest.fn(),
            updateChannel: jest.fn(),
            inviteChannel: jest.fn(),
            leaveChannel: jest.fn(),
            deleteChannel: jest.fn(),
            getSelfChannel: jest.fn(),
            getUnreads: jest.fn(),
        };
        const channelLocalDataSource = {
            observeList: jest.fn(() => () => undefined),
            observeItem: jest.fn(() => () => undefined),
            cacheRead: jest.fn(),
            cacheReadList: jest.fn().mockResolvedValue({ list: [] }),
            cacheWrite: jest.fn(),
            cacheWriteMany: jest.fn(),
            cacheDelete: jest.fn(),
            cacheDeleteMany: jest.fn(),
            cacheClear: jest.fn(),
        };
        const contextProvider = {
            getContext: () => ({ cid: 'cloud-a', sid: 'site-old', uid: 'me' }),
            setContext: () => undefined,
        };
        const repository = new ChannelRepositoryV2(
            channelRemoteDataSource as any,
            channelLocalDataSource as any,
            contextProvider
        );

        await repository.refreshList({ sid: 'site-new' } as any);

        // Mapping context carries the viewed sid so toDomainChannel tags channels with it...
        expect(channelRemoteDataSource.fetchChannel).toHaveBeenCalledWith(
            { sid: 'site-new' },
            { cid: 'cloud-a', sid: 'site-new', uid: 'me' }
        );
        // ...but the cache write runs under the LIVE context so the list re-emit reaches
        // observers subscribed on that scope (mismatched scope = missed updates).
        expect(channelLocalDataSource.cacheWriteMany).toHaveBeenCalledWith([{ id: 'ch-1' }], {
            cid: 'cloud-a',
            sid: 'site-old',
            uid: 'me',
        });
    });

    it('delegates read and cache helper methods to the local datasource with the runtime context', async () => {
        const { repository, channelLocalDataSource } = createRepository();

        await repository.cacheRead('ch-1');
        await repository.cacheReadList({ sid: 'site-1' } as any);
        await repository.cacheWrite({ id: 'ch-1' } as any);
        await repository.cacheWriteMany([{ id: 'ch-1' }] as any);
        await repository.cacheDelete('ch-1');
        await repository.cacheClear();

        // Helper methods should stay thin wrappers so hooks can rely on a consistent context-bound API.
        expect(channelLocalDataSource.cacheRead).toHaveBeenCalledWith('ch-1', {
            cid: 'cloud-a',
            sid: 'site-1',
            uid: 'me',
        });
        expect(channelLocalDataSource.cacheClear).toHaveBeenCalledWith({
            cid: 'cloud-a',
            sid: 'site-1',
            uid: 'me',
        });
    });

    it('passes through remote helper commands that do not mutate local cache themselves', async () => {
        const { repository, channelRemoteDataSource } = createRepository();
        channelRemoteDataSource.getSelfChannel.mockResolvedValue({ id: 'self-channel' });
        channelRemoteDataSource.getUnreads.mockResolvedValue({ total: 3 });

        // These helpers are transport pass-throughs and should not invent local side effects.
        await expect(repository.getSelfChannel({} as any)).resolves.toEqual({ id: 'self-channel' });
        await expect(repository.getUnreads({} as any)).resolves.toEqual({ total: 3 });
    });
});
