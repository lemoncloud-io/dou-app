import { ChatRepositoryV2 } from './ChatRepositoryV2';

describe('ChatRepositoryV2', () => {
    const createRepository = () => {
        // Split remote and local mocks so optimistic write and refresh behavior can be asserted independently.
        const chatRemoteDataSource = {
            fetchChat: jest.fn(),
            sendChat: jest.fn(),
            getChat: jest.fn(),
            updateChat: jest.fn(),
            deleteChat: jest.fn(),
            setReaction: jest.fn(),
        };
        const chatLocalDataSource = {
            observeList: jest.fn(() => () => undefined),
            observeItem: jest.fn(() => () => undefined),
            cacheRead: jest.fn(),
            cacheReadList: jest.fn(),
            cacheWrite: jest.fn(),
            cacheWriteMany: jest.fn(),
            cacheDelete: jest.fn(),
            cacheClear: jest.fn(),
            cacheClearByChannelId: jest.fn(),
        };
        const contextProvider = {
            getContext: () => ({ cid: 'cloud-a', sid: 'site-1', uid: 'me' }),
            setContext: () => undefined,
        };

        return {
            repository: new ChatRepositoryV2(chatRemoteDataSource as any, chatLocalDataSource as any, contextProvider),
            chatRemoteDataSource,
            chatLocalDataSource,
        };
    };

    // Reactions are event-sourced: the server stores no state, so the optimistic write is
    // an event of our own rather than an edit to the target message.
    it('writes a provisional reaction event before the request, then swaps in the server one', async () => {
        const { repository, chatRemoteDataSource, chatLocalDataSource } = createRepository();
        chatRemoteDataSource.setReaction.mockResolvedValue({ id: 'ch-1:9', chatNo: 9 });

        await repository.setReaction({ chatId: 'ch-1:4', emoji: '\u{1F44D}', action: 'on' } as any);

        const [provisional] = chatLocalDataSource.cacheWrite.mock.calls[0];
        expect(provisional).toMatchObject({
            channelId: 'ch-1',
            chatNo: 0,
            stereo: 'system',
            subType: 'reaction',
            ownerId: 'me',
            reaction$: { chatId: 'ch-1:4', emoji: '\u{1F44D}', action: 'on' },
        });
        // No chatNo yet, so the fold sorts it last and it wins over the persisted events.
        expect(chatLocalDataSource.cacheWrite.mock.calls[1][0]).toMatchObject({ id: 'ch-1:9' });
        expect(chatLocalDataSource.cacheDelete).toHaveBeenCalledWith(provisional.id, expect.anything());
    });

    it('removes the provisional reaction event when the request rejects', async () => {
        const { repository, chatRemoteDataSource, chatLocalDataSource } = createRepository();
        chatRemoteDataSource.setReaction.mockRejectedValue(new Error('offline'));

        await expect(
            repository.setReaction({ chatId: 'ch-1:4', emoji: '\u{1F44D}', action: 'on' } as any)
        ).rejects.toThrow('offline');

        const [provisional] = chatLocalDataSource.cacheWrite.mock.calls[0];
        // Nothing to restore — the event existed only here, so removing it is the rollback.
        expect(chatLocalDataSource.cacheDelete).toHaveBeenCalledWith(provisional.id, expect.anything());
        expect(chatLocalDataSource.cacheWrite).toHaveBeenCalledTimes(1);
    });

    it('marks the optimistic message as failed when sendChat rejects', async () => {
        const { repository, chatRemoteDataSource, chatLocalDataSource } = createRepository();
        chatRemoteDataSource.sendChat.mockRejectedValue(new Error('boom'));

        await expect(repository.sendChat({ channelId: 'ch-1', content: 'hello' } as any)).rejects.toThrow('boom');

        // The second write should preserve the optimistic message but flip it into a failed state.
        expect(chatLocalDataSource.cacheWrite).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                isPending: false,
                isFailed: true,
                channelId: 'ch-1',
            }),
            { cid: 'cloud-a', sid: 'site-1', uid: 'me' }
        );
    });

    it('throws when refreshList is called without channelId', async () => {
        const { repository } = createRepository();

        await expect(repository.refreshList({ limit: 50 } as any)).rejects.toThrow(
            '[RepositoryV2] channelId is required.'
        );
    });

    it('writes remote feed results into local cache and returns refresh metadata', async () => {
        const { repository, chatRemoteDataSource, chatLocalDataSource } = createRepository();
        chatRemoteDataSource.fetchChat.mockResolvedValue({
            list: [{ id: 'm1', channelId: 'ch-1', chatNo: 3, content: 'hello' }],
            cursorNo: 2,
            readNo: 3,
            total: 1,
        });

        const result = await repository.refreshList({ channelId: 'ch-1', limit: 50 } as any);

        // Refresh should populate local cache first and only use the return value for pagination metadata.
        expect(chatLocalDataSource.cacheWriteMany).toHaveBeenCalledWith(
            [expect.objectContaining({ id: 'm1', channelId: 'ch-1' })],
            { cid: 'cloud-a', sid: 'site-1', uid: 'me' }
        );
        expect(result).toEqual({ fetchedCount: 1, cursorNo: 2, readNo: 3, total: 1 });
    });

    it('hydrates local cache when getChat resolves from remote', async () => {
        const { repository, chatRemoteDataSource, chatLocalDataSource } = createRepository();
        chatRemoteDataSource.getChat.mockResolvedValue({ id: 'm1', channelId: 'ch-1', content: 'hello' });

        const result = await repository.getChat({ id: 'm1' } as any);

        expect(chatLocalDataSource.cacheWrite).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'm1', channelId: 'ch-1' }),
            { cid: 'cloud-a', sid: 'site-1', uid: 'me' }
        );
        expect(result).toEqual(expect.objectContaining({ id: 'm1' }));
    });

    it('rolls back the optimistic patch when updateChat fails', async () => {
        const { repository, chatRemoteDataSource, chatLocalDataSource } = createRepository();
        chatLocalDataSource.cacheRead.mockResolvedValue({ id: 'm1', content: 'before' });
        chatRemoteDataSource.updateChat.mockRejectedValue(new Error('boom'));

        await expect(repository.updateChat({ id: 'm1', content: 'after' } as any)).rejects.toThrow('boom');

        expect(chatLocalDataSource.cacheWrite).toHaveBeenLastCalledWith(
            expect.objectContaining({ id: 'm1', content: 'before' }),
            { cid: 'cloud-a', sid: 'site-1', uid: 'me' }
        );
    });

    it('restores the deleted chat when deleteChat fails', async () => {
        const { repository, chatRemoteDataSource, chatLocalDataSource } = createRepository();
        chatLocalDataSource.cacheRead.mockResolvedValue({ id: 'm1', content: 'before' });
        chatRemoteDataSource.deleteChat.mockRejectedValue(new Error('boom'));

        await expect(repository.deleteChat({ id: 'm1' } as any)).rejects.toThrow('boom');

        expect(chatLocalDataSource.cacheDelete).toHaveBeenCalledWith('m1', {
            cid: 'cloud-a',
            sid: 'site-1',
            uid: 'me',
        });
        expect(chatLocalDataSource.cacheWrite).toHaveBeenLastCalledWith(
            expect.objectContaining({ id: 'm1', content: 'before' }),
            { cid: 'cloud-a', sid: 'site-1', uid: 'me' }
        );
    });

    it('delegates cache helper methods to the local datasource', async () => {
        const { repository, chatLocalDataSource } = createRepository();

        await repository.cacheRead('m1');
        await repository.cacheReadList({ channelId: 'ch-1' } as any);
        await repository.cacheWrite({ id: 'm1' } as any);
        await repository.cacheWriteMany([{ id: 'm1' }] as any);
        await repository.cacheDelete('m1');
        await repository.cacheClear();
        await repository.cacheClearByChannelId('ch-1');

        // Channel-scoped clear is a distinct helper and should keep the active runtime context.
        expect(chatLocalDataSource.cacheClearByChannelId).toHaveBeenCalledWith('ch-1', {
            cid: 'cloud-a',
            sid: 'site-1',
            uid: 'me',
        });
    });
});
