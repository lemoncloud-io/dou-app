import { ChatLocalDataSource } from '../local/data-sources/ChatLocalDataSource';
import { createPartitionedMemoryStorage } from '../local/data-sources/__mocks__/MemoryCacheStorage';
import type { DomainChat } from '../domain';
import { ChatRepository } from './ChatRepository';
import { feedCoverage } from './feedCoverage';

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
        const uploadSocketDataSource = {
            start: jest.fn(),
            complete: jest.fn(),
        };

        return {
            repository: new ChatRepository(
                chatSocketDataSource as any,
                chatLocalDataSource as any,
                contextProvider,
                uploadSocketDataSource
            ),
            chatSocketDataSource,
            chatLocalDataSource,
            uploadSocketDataSource,
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

    it('files a reaction on a place-keyed 1:1 message under that room', async () => {
        const { repository, chatSocketDataSource, chatLocalDataSource } = createRepository();
        chatSocketDataSource.setReaction.mockResolvedValue({ id: 'S1@u1@u2:9', chatNo: 9 });

        await repository.setReaction({ chatId: 'S1@u1@u2:4', emoji: '\u{1F44D}', action: 'on' } as any);

        expect(chatLocalDataSource.cacheWrite.mock.calls[0][0]).toMatchObject({ channelId: 'S1@u1@u2' });
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
        expect(result).toEqual({ fetchedCount: 1, latestNo: 3, cursorNo: 2, readNo: 3, total: 1 });
    });

    it('tells the caller when the server page arrived, before writing it to the cache', async () => {
        const { repository, chatSocketDataSource, chatLocalDataSource } = createRepository();
        const order: string[] = [];
        chatSocketDataSource.fetchChat.mockImplementation(async () => {
            order.push('fetch');
            return { list: [{ id: 'm1', channelId: 'ch-1', chatNo: 1 }], total: 1 };
        });
        chatLocalDataSource.cacheWriteMany.mockImplementation(async () => {
            order.push('write');
        });

        await repository.refreshList({ channelId: 'ch-1' } as any, { onFetched: () => order.push('fetched') });

        expect(order).toEqual(['fetch', 'fetched', 'write']);
    });

    it('does not report a page that never arrived', async () => {
        const { repository, chatSocketDataSource } = createRepository();
        chatSocketDataSource.fetchChat.mockRejectedValue(new Error('socket closed'));
        const onFetched = jest.fn();

        await expect(repository.refreshList({ channelId: 'ch-1' } as any, { onFetched })).rejects.toThrow(
            'socket closed'
        );
        expect(onFetched).not.toHaveBeenCalled();
    });

    it('reports the highest chatNo of the page written, and 0 for an empty page', async () => {
        const { repository, chatSocketDataSource } = createRepository();
        chatSocketDataSource.fetchChat.mockResolvedValue({
            list: [
                { id: 'm7', channelId: 'ch-1', chatNo: 7 },
                { id: 'm9', channelId: 'ch-1', chatNo: 9 },
                { id: 'm8', channelId: 'ch-1', chatNo: 8 },
            ],
            total: 3,
        });
        expect((await repository.refreshList({ channelId: 'ch-1' } as any)).latestNo).toBe(9);

        chatSocketDataSource.fetchChat.mockResolvedValue({ list: [], total: 0 });
        expect((await repository.refreshList({ channelId: 'ch-1' } as any)).latestNo).toBe(0);
    });

    describe('what a page answers for', () => {
        beforeEach(() => feedCoverage.clear());

        const row = (chatNo: number, over: Partial<DomainChat> = {}) =>
            ({ id: `ch-1:${chatNo}`, channelId: 'ch-1', chatNo, ...over }) as DomainChat;

        it('records the range below the request cursor down to the returned cursor', async () => {
            const { repository, chatSocketDataSource } = createRepository();
            chatSocketDataSource.fetchChat.mockResolvedValue({ list: [row(99), row(51)], cursorNo: 50, total: 200 });

            await repository.refreshList({ channelId: 'ch-1', cursorNo: 100, limit: 50 } as any);

            // 52–98 came back empty-handed: deleted, not unfetched.
            expect(repository.uncoveredFeed('ch-1', 40, 120)).toEqual([
                [40, 49],
                [100, 120],
            ]);
        });

        it('takes the newest page up to its newest row, and a 0 cursor down to the start', async () => {
            const { repository, chatSocketDataSource } = createRepository();
            chatSocketDataSource.fetchChat.mockResolvedValue({ list: [row(12), row(10)], cursorNo: 0, total: 2 });

            await repository.refreshList({ channelId: 'ch-1' } as any);

            expect(repository.uncoveredFeed('ch-1', 1, 15)).toEqual([[13, 15]]);
        });

        it('marks a cached row the page left out as deleted, when asked', async () => {
            const { repository, chatSocketDataSource, chatLocalDataSource } = createRepository();
            chatSocketDataSource.fetchChat.mockResolvedValue({ list: [row(62), row(60)], cursorNo: 60, total: 90 });
            chatLocalDataSource.cacheReadList.mockResolvedValue({
                list: [row(62), row(61, { content: 'gone' }), row(60), row(0, { id: 'tmp', isPending: true })],
            });

            await repository.refreshList({ channelId: 'ch-1', cursorNo: 63, limit: 3 } as any, {
                markMissingHidden: true,
            });

            expect(chatLocalDataSource.cacheReadList).toHaveBeenCalledWith(
                { channelId: 'ch-1', cursorNo: 63, limit: 3 },
                expect.anything()
            );
            expect(chatLocalDataSource.cacheWriteMany).toHaveBeenCalledWith(
                [row(62), row(60), expect.objectContaining({ chatNo: 61, hidden: true, hiddenByFeed: true })],
                expect.anything()
            );
        });

        it('does not read a missing row older than the page as deleted at the start of history', async () => {
            // Below the oldest row an end-of-history page carried sit rows from before my join, which
            // the server also leaves out.
            const { repository, chatSocketDataSource, chatLocalDataSource } = createRepository();
            chatSocketDataSource.fetchChat.mockResolvedValue({ list: [row(9), row(8)], cursorNo: 0, total: 2 });
            chatLocalDataSource.cacheReadList.mockResolvedValue({ list: [row(9), row(8)] });

            await repository.refreshList({ channelId: 'ch-1', cursorNo: 10, limit: 50 } as any, {
                markMissingHidden: true,
            });

            expect(chatLocalDataSource.cacheReadList).toHaveBeenCalledWith(
                { channelId: 'ch-1', cursorNo: 10, limit: 2 },
                expect.anything()
            );
        });

        it('leaves cached rows alone without the option', async () => {
            const { repository, chatSocketDataSource, chatLocalDataSource } = createRepository();
            chatSocketDataSource.fetchChat.mockResolvedValue({ list: [row(62)], cursorNo: 60, total: 90 });

            await repository.refreshList({ channelId: 'ch-1', cursorNo: 63, limit: 3 } as any);

            expect(chatLocalDataSource.cacheReadList).not.toHaveBeenCalled();
            expect(chatLocalDataSource.cacheWriteMany).toHaveBeenCalledWith([row(62)], expect.anything());
        });

        it('stops at the head the server counted from, not at a request cursor above it', async () => {
            // A block re-check near the newest messages asks below 1051 while the head is 1020; the
            // answer covers 971–1020. Message 1021, arriving meanwhile, is neither covered nor deleted.
            const { repository, chatSocketDataSource, chatLocalDataSource } = createRepository();
            const page = Array.from({ length: 50 }, (_, index) => row(1020 - index));
            chatSocketDataSource.fetchChat.mockResolvedValue({ list: page, cursorNo: 971, limit: 50 });
            chatLocalDataSource.cacheReadList.mockResolvedValue({ list: [row(1021), ...page] });

            await repository.refreshList({ channelId: 'ch-1', cursorNo: 1051, limit: 50 } as any, {
                markMissingHidden: true,
            });

            expect(repository.uncoveredFeed('ch-1', 960, 1060)).toEqual([
                [960, 970],
                [1021, 1060],
            ]);
            expect(chatLocalDataSource.cacheWriteMany).toHaveBeenCalledWith(page, expect.anything());
        });

        it('proves nothing with an empty page that ran to the start, unless the cursor is a known row', async () => {
            const { repository, chatSocketDataSource } = createRepository();
            chatSocketDataSource.fetchChat.mockResolvedValue({ list: [], cursorNo: 0 });

            await repository.refreshList({ channelId: 'ch-1', cursorNo: 30, limit: 50 } as any);
            expect(repository.uncoveredFeed('ch-1', 1, 29)).toEqual([[1, 29]]);

            await repository.refreshList({ channelId: 'ch-1', cursorNo: 30, limit: 50 } as any, { cursorIsRow: true });
            expect(repository.uncoveredFeed('ch-1', 1, 29)).toEqual([]);
        });

        it('forgets what pages answered for when the cache is cleared', async () => {
            const { repository, chatSocketDataSource } = createRepository();
            chatSocketDataSource.fetchChat.mockResolvedValue({ list: [row(99)], cursorNo: 50, limit: 50 });
            await repository.refreshList({ channelId: 'ch-1', cursorNo: 100, limit: 50 } as any);
            await repository.refreshList({ channelId: 'ch-2', cursorNo: 100, limit: 50 } as any);

            await repository.cacheClearByChannelId('ch-1');
            expect(repository.uncoveredFeed('ch-1', 50, 99)).toEqual([[50, 99]]);
            expect(repository.uncoveredFeed('ch-2', 50, 99)).toEqual([]);

            await repository.cacheClear();
            expect(repository.uncoveredFeed('ch-2', 50, 99)).toEqual([[50, 99]]);
        });
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

    // A failed row is the only copy of the send, and a resend is rebuilt from it.
    it('sends the picked mention and keeps it on the row that a failure leaves behind', async () => {
        const { repository, chatSocketDataSource, chatLocalDataSource } = createRepository();
        chatSocketDataSource.sendChat.mockRejectedValue(new Error('boom'));
        const mention = { userIds: ['u2'], all: true };

        await expect(repository.sendChat({ channelId: 'ch-1', content: '@Min hi', mention })).rejects.toThrow('boom');

        expect(chatSocketDataSource.sendChat).toHaveBeenCalledWith(
            expect.objectContaining({ mention }),
            expect.anything()
        );
        expect(chatLocalDataSource.cacheWrite).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({ isFailed: true, mention$: { userIds: ['u2'], all: true } }),
            expect.anything()
        );
    });

    it('writes no mention record for a send that picked no one', async () => {
        const { repository, chatSocketDataSource, chatLocalDataSource } = createRepository();
        chatSocketDataSource.sendChat.mockRejectedValue(new Error('boom'));

        await expect(repository.sendChat({ channelId: 'ch-1', content: 'hello' })).rejects.toThrow('boom');

        expect(chatLocalDataSource.cacheWrite.mock.calls[0][0]).not.toHaveProperty('mention$');
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
                createPartitionedMemoryStorage('chat')
            );

            return {
                repository: new ChatRepository(
                    chatSocketDataSource as any,
                    chatLocalDataSource as any,
                    contextProvider as any,
                    { start: jest.fn(), complete: jest.fn() }
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

    describe('uploads', () => {
        it('passes upload.start through and caches nothing', async () => {
            const { repository, uploadSocketDataSource, chatLocalDataSource } = createRepository();
            const ticket = { list: [{ upload: { id: 'up-1', status: 'pending' } }] };
            uploadSocketDataSource.start.mockResolvedValue(ticket);
            const payload = { list: [{ name: 'a.jpg', contentType: 'image/jpeg', contentSize: 10 }] };

            await expect(repository.startUploads(payload)).resolves.toBe(ticket);

            expect(uploadSocketDataSource.start).toHaveBeenCalledWith(payload);
            expect(chatLocalDataSource.cacheWrite).not.toHaveBeenCalled();
        });

        it('passes upload.complete through and caches nothing', async () => {
            const { repository, uploadSocketDataSource, chatLocalDataSource } = createRepository();
            const settled = { list: [{ id: 'up-1', status: 'stored' }] };
            uploadSocketDataSource.complete.mockResolvedValue(settled);

            await expect(repository.completeUploads({ list: [{ id: 'up-1' }] })).resolves.toBe(settled);

            expect(uploadSocketDataSource.complete).toHaveBeenCalledWith({ list: [{ id: 'up-1' }] });
            expect(chatLocalDataSource.cacheWrite).not.toHaveBeenCalled();
        });

        it('lets a rejected upload operation reach the caller', async () => {
            const { repository, uploadSocketDataSource } = createRepository();
            uploadSocketDataSource.start.mockRejectedValue(new Error('socket down'));

            await expect(repository.startUploads({ list: [] })).rejects.toThrow('socket down');
        });
    });

    describe('pending image rows', () => {
        const createPendingRepository = () => {
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
                createPartitionedMemoryStorage('chat')
            );
            const repository = new ChatRepository(
                chatSocketDataSource as any,
                chatLocalDataSource,
                contextProvider as any,
                { start: jest.fn(), complete: jest.fn() }
            );
            return { repository, chatSocketDataSource, chatLocalDataSource };
        };

        const SERVER_FIELDS = ['status', 'error', 'url', 'thumbnail'];

        it('writes a sending row with one local slot per image and no server field names', async () => {
            const { repository, chatLocalDataSource } = createPendingRepository();

            const id = await repository.createPendingImageChat({
                channelId: 'ch-1',
                parentId: 'root-1',
                localThumbUrls: ['blob:a', 'blob:b'],
            });

            const row = await chatLocalDataSource.cacheRead(id);
            expect(row).toMatchObject({
                channelId: 'ch-1',
                parentId: 'root-1',
                content: '',
                chatNo: 0,
                isPending: true,
                isFailed: false,
                upload$$: [
                    { localStatus: 'sending', localThumbUrl: 'blob:a' },
                    { localStatus: 'sending', localThumbUrl: 'blob:b' },
                ],
            });
            for (const slot of row?.upload$$ ?? []) {
                expect(Object.keys(slot).sort()).toEqual(['localStatus', 'localThumbUrl']);
                for (const field of SERVER_FIELDS) expect(slot).not.toHaveProperty(field);
            }
        });

        // A video or document has no preview to draw while it is sent; its card needs these instead.
        it('keeps the name, type and size of a file that is not an image on its slot', async () => {
            const { repository, chatLocalDataSource } = createPendingRepository();

            const id = await repository.createPendingImageChat({
                channelId: 'ch-1',
                localThumbUrls: ['blob:a', 'blob:b'],
                localFiles: [null, { name: 'a.pdf', contentType: 'application/pdf', size: 42 }],
            });

            const row = await chatLocalDataSource.cacheRead(id);
            expect(row?.upload$$).toEqual([
                { localStatus: 'sending', localThumbUrl: 'blob:a' },
                {
                    localStatus: 'sending',
                    localThumbUrl: 'blob:b',
                    localName: 'a.pdf',
                    localContentType: 'application/pdf',
                    localSize: 42,
                },
            ]);
        });

        it('keeps those details when the row is rewritten with previews only', async () => {
            const { repository, chatLocalDataSource } = createPendingRepository();
            const id = await repository.createPendingImageChat({
                channelId: 'ch-1',
                localThumbUrls: ['blob:a'],
                localFiles: [{ name: 'a.pdf', contentType: 'application/pdf', size: 42 }],
            });

            await repository.createPendingImageChat({ channelId: 'ch-1', localThumbUrls: ['blob:z'], pendingId: id });

            const row = await chatLocalDataSource.cacheRead(id);
            expect(row?.upload$$).toEqual([
                {
                    localStatus: 'sending',
                    localThumbUrl: 'blob:z',
                    localName: 'a.pdf',
                    localContentType: 'application/pdf',
                    localSize: 42,
                },
            ]);
        });

        it('sends with the stored upload ids and swaps the pending row for the server row', async () => {
            const { repository, chatSocketDataSource, chatLocalDataSource } = createPendingRepository();
            const id = await repository.createPendingImageChat({ channelId: 'ch-1', localThumbUrls: ['blob:a'] });
            chatSocketDataSource.sendChat.mockResolvedValue({
                id: 'ch-1:7',
                channelId: 'ch-1',
                chatNo: 7,
                content: '',
                upload$$: [{ id: 'up-1', status: 'stored' }],
            });

            const sent = await repository.sendPendingImageChat(id, { uploadIds: ['up-1'] });

            expect(chatSocketDataSource.sendChat).toHaveBeenCalledWith(
                { channelId: 'ch-1', content: '', uploadIds: ['up-1'] },
                expect.anything()
            );
            expect(sent).toMatchObject({ id: 'ch-1:7', tempId: id, isPending: false, isFailed: false });
            expect(await chatLocalDataSource.cacheRead(id)).toBeNull();
            expect(await chatLocalDataSource.cacheRead('ch-1:7')).toMatchObject({ chatNo: 7 });
        });

        describe('with text', () => {
            it('shows the text, trimmed, on the pending row from the moment it is written', async () => {
                const { repository, chatLocalDataSource } = createPendingRepository();

                const id = await repository.createPendingImageChat({
                    channelId: 'ch-1',
                    localThumbUrls: ['blob:a'],
                    content: '  look at this \n',
                });

                expect(await chatLocalDataSource.cacheRead(id)).toMatchObject({
                    content: 'look at this',
                    isPending: true,
                    upload$$: [{ localStatus: 'sending', localThumbUrl: 'blob:a' }],
                });
            });

            it('writes blank text as a row of images alone', async () => {
                const { repository, chatLocalDataSource } = createPendingRepository();

                const id = await repository.createPendingImageChat({
                    channelId: 'ch-1',
                    localThumbUrls: ['blob:a'],
                    content: ' \n ',
                });

                expect((await chatLocalDataSource.cacheRead(id))?.content).toBe('');
            });

            it('sends the text in the same message as the upload ids', async () => {
                const { repository, chatSocketDataSource } = createPendingRepository();
                const id = await repository.createPendingImageChat({
                    channelId: 'ch-1',
                    parentId: 'root-1',
                    localThumbUrls: ['blob:a', 'blob:b'],
                    content: 'look at this',
                });
                chatSocketDataSource.sendChat.mockResolvedValue({ id: 'ch-1:7', channelId: 'ch-1', chatNo: 7 });

                await repository.sendPendingImageChat(id, { uploadIds: ['up-1', 'up-2'] });

                expect(chatSocketDataSource.sendChat).toHaveBeenCalledTimes(1);
                expect(chatSocketDataSource.sendChat).toHaveBeenCalledWith(
                    { channelId: 'ch-1', parentId: 'root-1', content: 'look at this', uploadIds: ['up-1', 'up-2'] },
                    expect.anything()
                );
            });

            it('keeps the text through a failure and a retry, and sends it again', async () => {
                const { repository, chatSocketDataSource, chatLocalDataSource } = createPendingRepository();
                const id = await repository.createPendingImageChat({
                    channelId: 'ch-1',
                    localThumbUrls: ['blob:a'],
                    content: 'look at this',
                });
                chatSocketDataSource.sendChat.mockRejectedValueOnce(new Error('socket down'));
                await expect(repository.sendPendingImageChat(id, { uploadIds: ['up-1'] })).rejects.toThrow();
                await repository.failPendingImageChat(id);

                // A retry re-arms the row with its previews only, as the image send does.
                await repository.createPendingImageChat({
                    channelId: 'ch-1',
                    localThumbUrls: ['blob:a'],
                    pendingId: id,
                });
                expect(await chatLocalDataSource.cacheRead(id)).toMatchObject({
                    content: 'look at this',
                    isPending: true,
                });
                chatSocketDataSource.sendChat.mockResolvedValueOnce({ id: 'ch-1:9', channelId: 'ch-1', chatNo: 9 });
                await repository.sendPendingImageChat(id, { uploadIds: ['up-2'] });

                expect(chatSocketDataSource.sendChat.mock.calls.map(call => call[0].content)).toEqual([
                    'look at this',
                    'look at this',
                ]);
            });

            it('sends the mention with the text and sends it again on a retry', async () => {
                const { repository, chatSocketDataSource } = createPendingRepository();
                const id = await repository.createPendingImageChat({
                    channelId: 'ch-1',
                    localThumbUrls: ['blob:a'],
                    content: '@Min look',
                    mention: { userIds: ['u2'] },
                });
                chatSocketDataSource.sendChat.mockRejectedValueOnce(new Error('socket down'));
                await expect(repository.sendPendingImageChat(id, { uploadIds: ['up-1'] })).rejects.toThrow();
                await repository.failPendingImageChat(id);

                // The retry re-arms the row without naming the mention, as the image send does.
                await repository.createPendingImageChat({
                    channelId: 'ch-1',
                    localThumbUrls: ['blob:a'],
                    pendingId: id,
                });
                chatSocketDataSource.sendChat.mockResolvedValueOnce({ id: 'ch-1:9', channelId: 'ch-1', chatNo: 9 });
                await repository.sendPendingImageChat(id, { uploadIds: ['up-2'] });

                expect(chatSocketDataSource.sendChat.mock.calls.map(call => call[0].mention)).toEqual([
                    { userIds: ['u2'] },
                    { userIds: ['u2'] },
                ]);
            });

            it('sends no mention for a caption that picked no one', async () => {
                const { repository, chatSocketDataSource } = createPendingRepository();
                const id = await repository.createPendingImageChat({
                    channelId: 'ch-1',
                    localThumbUrls: ['blob:a'],
                    content: 'look',
                });
                chatSocketDataSource.sendChat.mockResolvedValue({ id: 'ch-1:7', channelId: 'ch-1', chatNo: 7 });

                await repository.sendPendingImageChat(id, { uploadIds: ['up-1'] });

                expect(chatSocketDataSource.sendChat.mock.calls[0][0]).not.toHaveProperty('mention');
            });

            it('replaces the text when a rewrite of the row names one', async () => {
                const { repository, chatLocalDataSource } = createPendingRepository();
                const id = await repository.createPendingImageChat({
                    channelId: 'ch-1',
                    localThumbUrls: ['blob:a'],
                    content: 'look at this',
                });

                await repository.createPendingImageChat({
                    channelId: 'ch-1',
                    localThumbUrls: ['blob:a'],
                    pendingId: id,
                    content: ' and this ',
                });

                expect((await chatLocalDataSource.cacheRead(id))?.content).toBe('and this');
            });
        });

        it('reads the sent message back once, because the send answer carries no image address', async () => {
            const { repository, chatSocketDataSource, chatLocalDataSource } = createPendingRepository();
            const id = await repository.createPendingImageChat({ channelId: 'ch-1', localThumbUrls: ['blob:a'] });
            chatSocketDataSource.sendChat.mockResolvedValue({
                id: 'ch-1:7',
                channelId: 'ch-1',
                chatNo: 7,
                upload$$: [{ id: 'up-1', status: 'stored', stereo: 'image' }],
            });
            chatSocketDataSource.getChat.mockResolvedValue({
                id: 'ch-1:7',
                channelId: 'ch-1',
                chatNo: 7,
                upload$$: [
                    { id: 'up-1', status: 'stored', stereo: 'image', orgUrl: 'https://o', thumbUrl: 'https://t' },
                ],
            });

            const sent = await repository.sendPendingImageChat(id, { uploadIds: ['up-1'] });

            expect(chatSocketDataSource.getChat).toHaveBeenCalledWith({ id: 'ch-1:7' }, expect.anything());
            expect(sent).toMatchObject({ id: 'ch-1:7', tempId: id, isPending: false });
            expect((await chatLocalDataSource.cacheRead('ch-1:7'))?.upload$$).toEqual([
                { id: 'up-1', status: 'stored', stereo: 'image', orgUrl: 'https://o', thumbUrl: 'https://t' },
            ]);
        });

        it('still counts the message as sent when the read-back fails', async () => {
            const { repository, chatSocketDataSource, chatLocalDataSource } = createPendingRepository();
            const id = await repository.createPendingImageChat({ channelId: 'ch-1', localThumbUrls: ['blob:a'] });
            chatSocketDataSource.sendChat.mockResolvedValue({ id: 'ch-1:8', channelId: 'ch-1', chatNo: 8 });
            chatSocketDataSource.getChat.mockRejectedValue(new Error('timeout'));

            await expect(repository.sendPendingImageChat(id, { uploadIds: ['up-1'] })).resolves.toMatchObject({
                id: 'ch-1:8',
            });
            expect(await chatLocalDataSource.cacheRead(id)).toBeNull();
            expect(await chatLocalDataSource.cacheRead('ch-1:8')).toMatchObject({ chatNo: 8, isFailed: false });
        });

        it('keeps a thread reply in its thread when sending', async () => {
            const { repository, chatSocketDataSource } = createPendingRepository();
            const id = await repository.createPendingImageChat({
                channelId: 'ch-1',
                parentId: 'root-1',
                localThumbUrls: ['blob:a'],
            });
            chatSocketDataSource.sendChat.mockResolvedValue({ id: 'ch-1:8', channelId: 'ch-1', chatNo: 8 });

            await repository.sendPendingImageChat(id, { uploadIds: ['up-1'] });

            expect(chatSocketDataSource.sendChat.mock.calls[0][0]).toMatchObject({ parentId: 'root-1' });
        });

        it('leaves the pending row in place and throws when the send fails', async () => {
            const { repository, chatSocketDataSource, chatLocalDataSource } = createPendingRepository();
            const id = await repository.createPendingImageChat({ channelId: 'ch-1', localThumbUrls: ['blob:a'] });
            chatSocketDataSource.sendChat.mockRejectedValue(new Error('socket down'));

            await expect(repository.sendPendingImageChat(id, { uploadIds: ['up-1'] })).rejects.toThrow('socket down');
            expect(await chatLocalDataSource.cacheRead(id)).toMatchObject({ isPending: true });
        });

        it('refuses to send a pending row that no longer exists', async () => {
            const { repository, chatSocketDataSource } = createPendingRepository();

            await expect(repository.sendPendingImageChat('gone', { uploadIds: ['up-1'] })).rejects.toThrow('gone');
            expect(chatSocketDataSource.sendChat).not.toHaveBeenCalled();
        });

        it('fails the row and every slot, then re-arms the same row for a retry that is confirmed', async () => {
            const { repository, chatSocketDataSource, chatLocalDataSource } = createPendingRepository();
            const id = await repository.createPendingImageChat({
                channelId: 'ch-1',
                localThumbUrls: ['blob:a', 'blob:b'],
            });

            await repository.failPendingImageChat(id);
            expect(await chatLocalDataSource.cacheRead(id)).toMatchObject({
                isPending: false,
                isFailed: true,
                upload$$: [
                    { localStatus: 'failed', localThumbUrl: 'blob:a' },
                    { localStatus: 'failed', localThumbUrl: 'blob:b' },
                ],
            });

            const again = await repository.createPendingImageChat({
                channelId: 'ch-1',
                localThumbUrls: ['blob:a', 'blob:b'],
                pendingId: id,
            });
            expect(again).toBe(id);
            expect(await chatLocalDataSource.cacheRead(id)).toMatchObject({
                isPending: true,
                isFailed: false,
                upload$$: [{ localStatus: 'sending' }, { localStatus: 'sending' }],
            });

            chatSocketDataSource.sendChat.mockResolvedValue({ id: 'ch-1:9', channelId: 'ch-1', chatNo: 9 });
            await repository.sendPendingImageChat(id, { uploadIds: ['up-1', 'up-2'] });
            expect(await chatLocalDataSource.cacheRead(id)).toBeNull();
        });

        it('does not bring back a failed row that was deleted in the meantime', async () => {
            const { repository, chatLocalDataSource } = createPendingRepository();
            const id = await repository.createPendingImageChat({ channelId: 'ch-1', localThumbUrls: ['blob:a'] });
            await chatLocalDataSource.cacheDelete(id);

            await repository.failPendingImageChat(id);

            expect(await chatLocalDataSource.cacheRead(id)).toBeNull();
        });

        it('refuses to re-arm a row that was deleted, instead of recreating it without a channel', async () => {
            const { repository, chatLocalDataSource } = createPendingRepository();
            const id = await repository.createPendingImageChat({ channelId: 'ch-1', localThumbUrls: ['blob:a'] });
            await chatLocalDataSource.cacheDelete(id);

            await expect(
                repository.createPendingImageChat({ channelId: 'ch-1', localThumbUrls: ['blob:a'], pendingId: id })
            ).rejects.toThrow('gone');
            expect(await chatLocalDataSource.cacheRead(id)).toBeNull();
        });

        describe('when the cloud switches during the send', () => {
            const createSwitchingRepository = () => {
                let context = { cid: 'cloud-a', sid: 'site-1', uid: 'me' };
                const contextProvider = { getContext: () => context, setContext: () => undefined };
                const chatSocketDataSource = { sendChat: jest.fn() };
                const chatLocalDataSource = new ChatLocalDataSource(
                    contextProvider as any,
                    createPartitionedMemoryStorage('chat')
                );
                const repository = new ChatRepository(
                    chatSocketDataSource as any,
                    chatLocalDataSource,
                    contextProvider as any,
                    { start: jest.fn(), complete: jest.fn() }
                );
                const switchTo = (cid: string) => {
                    context = { ...context, cid };
                };
                const readIn = (cid: string, id: string) =>
                    chatLocalDataSource.cacheRead(id, { cid, uid: 'me' } as any);
                return { repository, chatSocketDataSource, switchTo, readIn };
            };

            it('fails the row in the cloud it was written in', async () => {
                const { repository, switchTo, readIn } = createSwitchingRepository();
                const id = await repository.createPendingImageChat({ channelId: 'ch-1', localThumbUrls: ['blob:a'] });

                switchTo('cloud-b');
                await repository.failPendingImageChat(id);

                expect(await readIn('cloud-a', id)).toMatchObject({ isFailed: true });
                expect(await readIn('cloud-b', id)).toBeNull();
            });

            it('does not post the uploads to the other cloud', async () => {
                const { repository, chatSocketDataSource, switchTo } = createSwitchingRepository();
                const id = await repository.createPendingImageChat({ channelId: 'ch-1', localThumbUrls: ['blob:a'] });

                switchTo('cloud-b');

                await expect(repository.sendPendingImageChat(id, { uploadIds: ['up-1'] })).rejects.toThrow(
                    'another cloud'
                );
                expect(chatSocketDataSource.sendChat).not.toHaveBeenCalled();
            });
        });

        it('lists only the unsent image rows of the channel', async () => {
            const { repository, chatLocalDataSource } = createPendingRepository();
            const mine = await repository.createPendingImageChat({ channelId: 'ch-1', localThumbUrls: ['blob:a'] });
            await repository.createPendingImageChat({ channelId: 'ch-2', localThumbUrls: ['blob:b'] });
            await chatLocalDataSource.cacheWriteMany([
                { id: 'optimistic-text', channelId: 'ch-1', chatNo: 0, content: 'hi', isPending: true },
                { id: 'ch-1:3', channelId: 'ch-1', chatNo: 3, upload$$: [{ id: 'up-9', status: 'stored' }] },
            ]);

            const rows = await repository.listPendingImageChats('ch-1');

            expect(rows.map(row => row.id)).toEqual([mine]);
        });

        // Compile-time half: a mixed list goes through both cache writes without a cast.
        it('stores server uploads and pending slots side by side', async () => {
            const { chatLocalDataSource } = createPendingRepository();
            const mixed: DomainChat['upload$$'] = [
                { id: 'up-1', status: 'stored' },
                { localStatus: 'sending', localThumbUrl: 'blob:a' },
            ];

            await chatLocalDataSource.cacheWrite({ id: 'm1', channelId: 'ch-1', upload$$: mixed });
            await chatLocalDataSource.cacheWriteMany([{ id: 'm2', channelId: 'ch-1', upload$$: mixed }]);

            expect((await chatLocalDataSource.cacheRead('m1'))?.upload$$).toEqual(mixed);
            expect((await chatLocalDataSource.cacheRead('m2'))?.upload$$).toEqual(mixed);
        });
    });
});
