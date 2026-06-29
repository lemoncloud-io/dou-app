import { JoinRepositoryV2 } from './JoinRepositoryV2';

describe('JoinRepositoryV2', () => {
    const createRepository = () => {
        // Keep join transport mocked separately from local cache so rollback behavior is explicit.
        const joinRemoteDataSource = {
            getJoin: jest.fn(),
            readChat: jest.fn(),
            updateJoin: jest.fn(),
            updateChannelJoin: jest.fn(),
            joinChannel: jest.fn(),
        };
        const joinLocalDataSource = {
            observeList: jest.fn(() => () => undefined),
            observeItem: jest.fn(() => () => undefined),
            cacheRead: jest.fn(),
            cacheReadList: jest.fn(),
            cacheWrite: jest.fn(),
            cacheWriteMany: jest.fn(),
            cacheDelete: jest.fn(),
            cacheClear: jest.fn(),
        };
        const contextProvider = {
            getContext: () => ({ cid: 'cloud-a', sid: 'site-1', uid: 'me' }),
            setContext: () => undefined,
        };

        return {
            repository: new JoinRepositoryV2(joinRemoteDataSource as any, joinLocalDataSource as any, contextProvider),
            joinRemoteDataSource,
            joinLocalDataSource,
        };
    };

    it('restores the previous join snapshot when readChat fails after an optimistic update', async () => {
        const { repository, joinRemoteDataSource, joinLocalDataSource } = createRepository();
        joinLocalDataSource.cacheReadList.mockResolvedValue({
            list: [{ id: 'join-1', channelId: 'ch-1', userId: 'me', readNo: 4 }],
        });
        joinRemoteDataSource.readChat.mockRejectedValue(new Error('boom'));

        await expect(repository.readChat({ channelId: 'ch-1', chatNo: 9 } as any)).rejects.toThrow('boom');

        // The rollback should write back the previous join after the failed remote call.
        expect(joinLocalDataSource.cacheWrite).toHaveBeenLastCalledWith(
            expect.objectContaining({ id: 'join-1', readNo: 4 }),
            { cid: 'cloud-a', sid: 'site-1', uid: 'me' }
        );
    });

    it('throws when readChat is called without channelId', async () => {
        const { repository } = createRepository();

        await expect(repository.readChat({ chatNo: 9 } as any)).rejects.toThrow(
            '[RepositoryV2] channelId is required.'
        );
    });

    it('returns the current local join snapshot from refreshList without touching remote transport', async () => {
        const { repository, joinRemoteDataSource, joinLocalDataSource } = createRepository();
        joinLocalDataSource.cacheReadList.mockResolvedValue({
            list: [{ id: 'join-1', channelId: 'ch-1', userId: 'me' }],
            meta: { total: 1, source: 'local' },
        });

        const result = await repository.refreshList({ channelId: 'ch-1', activeOnly: true });

        // refreshList is local-first in V2 and should not trigger remote I/O on its own.
        expect(joinRemoteDataSource.readChat).not.toHaveBeenCalled();
        expect(result.list.map((item: any) => item.id)).toEqual(['join-1']);
    });

    it('creates and then clears an optimistic join placeholder around joinChannel', async () => {
        const { repository, joinRemoteDataSource, joinLocalDataSource } = createRepository();
        joinRemoteDataSource.joinChannel.mockResolvedValue({
            id: 'join-2',
            channelId: 'ch-1',
            userId: 'me',
            joined: 1,
        });

        const result = await repository.joinChannel({ channelId: 'ch-1' } as any);

        // The optimistic placeholder should be cleaned up once the canonical join arrives.
        expect(joinLocalDataSource.cacheDelete).toHaveBeenCalledWith(expect.stringContaining('optimistic-join-ch-1'), {
            cid: 'cloud-a',
            sid: 'site-1',
            uid: 'me',
        });
        expect(result).toEqual(expect.objectContaining({ id: 'join-2', channelId: 'ch-1' }));
    });
});
