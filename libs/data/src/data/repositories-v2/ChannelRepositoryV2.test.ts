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
