import { JoinRepository } from './JoinRepository';

describe('JoinRepository', () => {
    const createRepository = () => {
        // Keep join transport mocked separately from local cache so rollback behavior is explicit.
        const joinSocketDataSource = {
            readChat: jest.fn(),
            updateJoin: jest.fn(),
            updateChannelJoin: jest.fn(),
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
            repository: new JoinRepository(joinSocketDataSource as any, joinLocalDataSource as any, contextProvider),
            joinSocketDataSource,
            joinLocalDataSource,
        };
    };

    it('restores the previous join snapshot when readChat fails after an optimistic update', async () => {
        const { repository, joinSocketDataSource, joinLocalDataSource } = createRepository();
        joinLocalDataSource.cacheReadList.mockResolvedValue({
            list: [{ id: 'join-1', channelId: 'ch-1', userId: 'me', readNo: 4 }],
        });
        joinSocketDataSource.readChat.mockRejectedValue(new Error('boom'));

        await expect(repository.readChat({ channelId: 'ch-1', chatNo: 9 } as any)).rejects.toThrow('boom');

        // The rollback should write back the previous join after the failed remote call.
        expect(joinLocalDataSource.cacheWrite).toHaveBeenLastCalledWith(
            expect.objectContaining({ id: 'join-1', readNo: 4 }),
            { cid: 'cloud-a', sid: 'site-1', uid: 'me' }
        );
    });

    it('throws when readChat is called without channelId', async () => {
        const { repository } = createRepository();

        await expect(repository.readChat({ chatNo: 9 } as any)).rejects.toThrow('[Repository] channelId is required.');
    });
});
