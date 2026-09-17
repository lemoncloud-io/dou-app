import { ChatLocalDataSource } from '../local/data-sources/ChatLocalDataSource';
import { createMemoryCacheStorage } from '../local/data-sources/__mocks__/MemoryCacheStorage';
import { ChatRepository } from './ChatRepository';

describe('ChatRepository', () => {
    const createRepository = () => {
        // Split remote and local mocks so optimistic write and refresh behavior can be asserted independently.
        const chatSocketDataSource = {
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
            repository: new ChatRepository(chatSocketDataSource as any, chatLocalDataSource as any, contextProvider),
            chatSocketDataSource,
            chatLocalDataSource,
        };
    };

    // Reactions are event-sourced: the server stores no state, so the optimistic write is
    // an event of our own rather than an edit to the target message.
    it('writes a provisional reaction event before the request, then swaps in the server one', async () => {
        const { repository, chatSocketDataSource, chatLocalDataSource } = createRepository();
        chatSocketDataSource.setReaction.mockResolvedValue({ id: 'ch-1:9', chatNo: 9 });

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
        const { repository, chatSocketDataSource, chatLocalDataSource } = createRepository();
        chatSocketDataSource.setReaction.mockRejectedValue(new Error('offline'));

        await expect(
            repository.setReaction({ chatId: 'ch-1:4', emoji: '\u{1F44D}', action: 'on' } as any)
        ).rejects.toThrow('offline');

        const [provisional] = chatLocalDataSource.cacheWrite.mock.calls[0];
        // Nothing to restore — the event existed only here, so removing it is the rollback.
        expect(chatLocalDataSource.cacheDelete).toHaveBeenCalledWith(provisional.id, expect.anything());
        expect(chatLocalDataSource.cacheWrite).toHaveBeenCalledTimes(1);
    });

    it('marks the optimistic message as failed when sendChat rejects', async () => {
        const { repository, chatSocketDataSource, chatLocalDataSource } = createRepository();
        chatSocketDataSource.sendChat.mockRejectedValue(new Error('boom'));

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
            '[Repository] channelId is required.'
        );
    });

    it('writes remote feed results into local cache and returns refresh metadata', async () => {
        const { repository, chatSocketDataSource, chatLocalDataSource } = createRepository();
        chatSocketDataSource.fetchChat.mockResolvedValue({
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
        const { repository, chatSocketDataSource, chatLocalDataSource } = createRepository();
        chatSocketDataSource.getChat.mockResolvedValue({ id: 'm1', channelId: 'ch-1', content: 'hello' });

        const result = await repository.getChat({ id: 'm1' } as any);

        expect(chatLocalDataSource.cacheWrite).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'm1', channelId: 'ch-1' }),
            { cid: 'cloud-a', sid: 'site-1', uid: 'me' }
        );
        expect(result).toEqual(expect.objectContaining({ id: 'm1' }));
    });

    it('rolls back the optimistic patch when updateChat fails', async () => {
        const { repository, chatSocketDataSource, chatLocalDataSource } = createRepository();
        chatLocalDataSource.cacheRead.mockResolvedValue({ id: 'm1', content: 'before' });
        chatSocketDataSource.updateChat.mockRejectedValue(new Error('boom'));

        await expect(repository.updateChat({ id: 'm1', content: 'after' } as any)).rejects.toThrow('boom');

        expect(chatLocalDataSource.cacheWrite).toHaveBeenLastCalledWith(
            expect.objectContaining({ id: 'm1', content: 'before' }),
            { cid: 'cloud-a', sid: 'site-1', uid: 'me' }
        );
    });

    // Not optimistic (see deleteChat's doc comment): nothing is written before the server answers,
    // and what is written then is the server's own record, tombstone flag included.
    it('writes only the server record when deleteChat succeeds, and never removes the row', async () => {
        const { repository, chatSocketDataSource, chatLocalDataSource } = createRepository();
        chatSocketDataSource.deleteChat.mockResolvedValue({ id: 'm1', content: 'before', hidden: true });

        await repository.deleteChat({ id: 'm1' } as any);

        expect(chatLocalDataSource.cacheDelete).not.toHaveBeenCalledWith('m1', expect.anything());
        expect(chatLocalDataSource.cacheWrite).toHaveBeenCalledTimes(1);
        expect(chatLocalDataSource.cacheWrite).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'm1', hidden: true }),
            { cid: 'cloud-a', sid: 'site-1', uid: 'me' }
        );
    });

    it('touches the cache not at all when deleteChat fails', async () => {
        const { repository, chatSocketDataSource, chatLocalDataSource } = createRepository();
        chatSocketDataSource.deleteChat.mockRejectedValue(new Error('boom'));

        await expect(repository.deleteChat({ id: 'm1' } as any)).rejects.toThrow('boom');

        // There is no rollback to get right because there was no optimistic write to undo.
        expect(chatLocalDataSource.cacheWrite).not.toHaveBeenCalled();
        expect(chatLocalDataSource.cacheDelete).not.toHaveBeenCalled();
    });

    // Above this line the cache is a `jest.fn()`, which only answers "what was the write called
    // with". The delete rollback is a claim about what the cache CONTAINS afterwards, so it is
    // asserted here over a real ChatLocalDataSource on the in-memory storage fixture.
    describe('deleteChat over a real cache', () => {
        const createRealCacheRepository = () => {
            const chatSocketDataSource = {
                fetchChat: jest.fn(),
                sendChat: jest.fn(),
                getChat: jest.fn(),
                updateChat: jest.fn(),
                deleteChat: jest.fn(),
                setReaction: jest.fn(),
            };
            const contextProvider = {
                getContext: () => ({ cid: 'cloud-a', sid: 'site-1', uid: 'me' }),
                setContext: () => undefined,
            };
            const chatLocalDataSource = new ChatLocalDataSource(
                contextProvider as any,
                createMemoryCacheStorage() as any
            );

            return {
                repository: new ChatRepository(
                    chatSocketDataSource as any,
                    chatLocalDataSource as any,
                    contextProvider as any
                ),
                chatSocketDataSource,
                chatLocalDataSource,
            };
        };

        const seed = async (chatLocalDataSource: ChatLocalDataSource) => {
            await chatLocalDataSource.cacheWrite({ id: 'm1', channelId: 'ch-1', chatNo: 1, content: 'before' } as any);
        };

        // The one that matters. `cacheWrite` MERGES, so writing the previous record back cannot
        // clear a key that record never had — an optimistic `hidden: true` survives its own
        // rollback and the message stays deleted on screen while it is alive on the server.
        it('leaves the message visible when the delete fails', async () => {
            const { repository, chatSocketDataSource, chatLocalDataSource } = createRealCacheRepository();
            await seed(chatLocalDataSource);
            chatSocketDataSource.deleteChat.mockRejectedValue(new Error('boom'));

            await expect(repository.deleteChat({ id: 'm1' } as any)).rejects.toThrow('boom');

            const row = await chatLocalDataSource.cacheRead('m1');
            expect(row).toMatchObject({ id: 'm1', content: 'before' });
            expect(row?.hidden).toBeFalsy();
        });

        it('hides the message once the server confirms the delete', async () => {
            const { repository, chatSocketDataSource, chatLocalDataSource } = createRealCacheRepository();
            await seed(chatLocalDataSource);
            chatSocketDataSource.deleteChat.mockResolvedValue({
                id: 'm1',
                channelId: 'ch-1',
                chatNo: 1,
                content: 'before',
                hidden: true,
            });

            await repository.deleteChat({ id: 'm1' } as any);

            // Soft delete: the row survives as a tombstone rather than disappearing.
            const row = await chatLocalDataSource.cacheRead('m1');
            expect(row).toMatchObject({ id: 'm1', hidden: true });
        });
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
