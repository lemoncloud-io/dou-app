import { ChatLocalDataSource } from './ChatLocalDataSource';
import { createPartitionedMemoryStorage } from './__mocks__/MemoryCacheStorage';

describe('ChatLocalDataSource', () => {
    const contextProvider = {
        current: { cid: 'cloud-a', sid: 'site-1', uid: 'me' },
        getContext() {
            return this.current;
        },
        setContext(context: any) {
            this.current = context;
        },
    };

    it('returns only the requested channel page and clears one channel without touching others', async () => {
        const chats = createPartitionedMemoryStorage('chat');
        const dataSource = new ChatLocalDataSource(contextProvider as any, chats);

        await dataSource.cacheWriteMany([
            { id: 'm1', channelId: 'ch-1', chatNo: 1, content: 'a' } as any,
            { id: 'm2', channelId: 'ch-1', chatNo: 2, content: 'b' } as any,
            { id: 'm3', channelId: 'ch-2', chatNo: 3, content: 'c' } as any,
        ]);

        const beforeClear = await dataSource.cacheReadList({ channelId: 'ch-1', limit: 50 } as any);
        expect(beforeClear?.list.map(item => item.id)).toEqual(['m1', 'm2']);

        await dataSource.cacheClearByChannelId('ch-1');

        const afterClear = await dataSource.cacheReadList({ channelId: 'ch-1', limit: 50 } as any);
        const otherChannel = await dataSource.cacheReadList({ channelId: 'ch-2', limit: 50 } as any);

        expect(afterClear?.list).toEqual([]);
        expect(otherChannel?.list.map(item => item.id)).toEqual(['m3']);
    });

    describe('an older copy of a cached row', () => {
        const read = async (dataSource: ChatLocalDataSource, id = 'm1') => dataSource.cacheRead(id);
        const fresh = () => new ChatLocalDataSource(contextProvider as any, createPartitionedMemoryStorage('chat'));
        const row = (fields: Record<string, unknown>) => ({ id: 'm1', channelId: 'ch-1', chatNo: 1, ...fields }) as any;

        it('is not written over a newer edit', async () => {
            const dataSource = fresh();
            await dataSource.cacheWrite(row({ content: 'second', updatedAtMs: 200 }));

            await dataSource.cacheWrite(row({ content: 'first', updatedAtMs: 100 }));

            expect(await read(dataSource)).toMatchObject({ content: 'second', updatedAtMs: 200 });
        });

        it('does not bring a deleted message back', async () => {
            const dataSource = fresh();
            await dataSource.cacheWrite(row({ content: '', hidden: true, updatedAtMs: 300 }));

            await dataSource.cacheWriteMany([row({ content: 'original', hidden: false, updatedAtMs: 100 })]);

            expect(await read(dataSource)).toMatchObject({ content: '', hidden: true });
        });

        it('drops only the older rows of a batch and writes the rest', async () => {
            const dataSource = fresh();
            await dataSource.cacheWriteMany([
                row({ content: 'new', updatedAtMs: 200 }),
                { id: 'm2', channelId: 'ch-1', chatNo: 2, content: 'old', updatedAtMs: 100 } as any,
            ]);

            await dataSource.cacheWriteMany([
                row({ content: 'stale', updatedAtMs: 150 }),
                { id: 'm2', channelId: 'ch-1', chatNo: 2, content: 'edited', updatedAtMs: 250 } as any,
            ]);

            expect(await read(dataSource)).toMatchObject({ content: 'new' });
            expect(await read(dataSource, 'm2')).toMatchObject({ content: 'edited' });
        });

        it('writes a copy with the same time, so the same row received twice settles the same', async () => {
            const dataSource = fresh();
            await dataSource.cacheWrite(row({ content: 'a', updatedAtMs: 200 }));

            await dataSource.cacheWrite(row({ content: 'a', readCount: 3, updatedAtMs: 200 }));

            expect(await read(dataSource)).toMatchObject({ readCount: 3 });
        });

        it('compares only when both copies carry the server time', async () => {
            const dataSource = fresh();
            await dataSource.cacheWrite(row({ content: 'cached', updatedAtMs: 200 }));

            await dataSource.cacheWriteMany([row({ hidden: true, hiddenByFeed: true })]);

            expect(await read(dataSource)).toMatchObject({ hidden: true, hiddenByFeed: true });
        });

        it('does not stamp the device clock on a row written without a server time', async () => {
            const dataSource = fresh();
            await dataSource.cacheWrite(row({ content: 'edited here first' }));

            await dataSource.cacheWrite(row({ content: 'server answer', updatedAtMs: 100 }));

            expect(await read(dataSource)).toMatchObject({ content: 'server answer', updatedAtMs: 100 });
        });

        it('keeps the cached server time when a copy arrives without one', async () => {
            const dataSource = fresh();
            await dataSource.cacheWrite(row({ content: 'a', updatedAtMs: 200 }));
            await dataSource.cacheWrite(row({ readCount: 2, updatedAtMs: 0 }));

            await dataSource.cacheWrite(row({ content: 'stale', updatedAtMs: 100 }));

            expect(await read(dataSource)).toMatchObject({ content: 'a', updatedAtMs: 200 });
        });

        it('lets a failed edit put the previous text back', async () => {
            const dataSource = fresh();
            await dataSource.cacheWrite(row({ content: 'before', updatedAtMs: 200 }));
            const previous = await read(dataSource);
            await dataSource.cacheWrite({ ...previous, content: 'after' } as any);

            await dataSource.cacheWrite(previous as any);

            expect(await read(dataSource)).toMatchObject({ content: 'before' });
        });
    });

    describe('a deleted mark inferred from a feed page (hiddenByFeed)', () => {
        const read = async (dataSource: ChatLocalDataSource) =>
            (await dataSource.cacheReadList({ channelId: 'ch-1', limit: 50 } as any))?.list[0];

        it('is undone by a server copy that does not say the row is hidden', async () => {
            const dataSource = new ChatLocalDataSource(contextProvider as any, createPartitionedMemoryStorage('chat'));
            await dataSource.cacheWriteMany([
                { id: 'm1', channelId: 'ch-1', chatNo: 1, hidden: true, hiddenByFeed: true } as any,
            ]);

            await dataSource.cacheWriteMany([{ id: 'm1', channelId: 'ch-1', chatNo: 1, content: 'back' } as any]);

            expect(await read(dataSource)).toMatchObject({ hidden: false, hiddenByFeed: false, content: 'back' });
        });

        it('becomes a real delete when the server says the row is hidden', async () => {
            const dataSource = new ChatLocalDataSource(contextProvider as any, createPartitionedMemoryStorage('chat'));
            await dataSource.cacheWriteMany([
                { id: 'm1', channelId: 'ch-1', chatNo: 1, hidden: true, hiddenByFeed: true } as any,
            ]);

            await dataSource.cacheWrite({ id: 'm1', channelId: 'ch-1', chatNo: 1, hidden: true } as any);

            expect(await read(dataSource)).toMatchObject({ hidden: true, hiddenByFeed: false });
        });

        it('leaves a delete the server announced alone, whatever page brings the row', async () => {
            const dataSource = new ChatLocalDataSource(contextProvider as any, createPartitionedMemoryStorage('chat'));
            await dataSource.cacheWriteMany([{ id: 'm1', channelId: 'ch-1', chatNo: 1, hidden: true } as any]);

            await dataSource.cacheWriteMany([{ id: 'm1', channelId: 'ch-1', chatNo: 1, content: 'stale page' } as any]);

            expect(await read(dataSource)).toMatchObject({ hidden: true });
        });
    });

    it('a channel purge under a captured scope empties that scope only, even when the session has moved on', async () => {
        const chats = createPartitionedMemoryStorage('chat');
        const provider = { getContext: () => ({ cid: 'cloud-b', uid: 'me' }), setContext: () => undefined };
        const dataSource = new ChatLocalDataSource(provider, chats);
        await dataSource.cacheWrite({ id: 'a-1', channelId: 'ch-1', chatNo: 1 } as any, { cid: 'cloud-a', uid: 'me' });
        await dataSource.cacheWrite({ id: 'b-1', channelId: 'ch-1', chatNo: 1 } as any);

        await dataSource.cacheClearByChannelId('ch-1', { cid: 'cloud-a', uid: 'me' });

        const idsIn = async (cid: string) =>
            (await chats.forScope({ cid, uid: 'me' }).loadAll({ channelId: 'ch-1' } as any)).map(row => row.id);
        expect(await idsIn('cloud-a')).toEqual([]);
        expect(await idsIn('cloud-b')).toEqual(['b-1']);
    });

    it('throws when chat list input is missing channelId instead of returning an empty fallback', async () => {
        const chats = createPartitionedMemoryStorage('chat');
        const dataSource = new ChatLocalDataSource(contextProvider as any, chats);

        await expect(dataSource.cacheReadList({ limit: 50 } as any)).rejects.toThrow(
            '[LocalDataSource] channelId is required.'
        );
    });

    describe('cacheReadLastList (ADR-0057)', () => {
        it('uses the storage fast path and preserves the requested channel order', async () => {
            const chats = createPartitionedMemoryStorage('chat');
            const storage = chats.forScope(contextProvider.getContext());
            storage.loadLastPerChannel = jest.fn(async () => [
                {
                    channelId: 'ch-2',
                    lastNo: 7,
                    item: { id: 'm7', channelId: 'ch-2', chatNo: 7 } as any,
                    activityItem: { id: 'm7', channelId: 'ch-2', chatNo: 7 } as any,
                },
                {
                    channelId: 'ch-1',
                    lastNo: 3,
                    item: { id: 'm3', channelId: 'ch-1', chatNo: 3 } as any,
                    activityItem: { id: 'm3', channelId: 'ch-1', chatNo: 3 } as any,
                },
            ]);
            const dataSource = new ChatLocalDataSource(contextProvider as any, chats);

            const result = await dataSource.cacheReadLastList(['ch-1', 'ch-2']);

            expect(storage.loadLastPerChannel).toHaveBeenCalledWith(['ch-1', 'ch-2']);
            expect(result.map(row => row.channelId)).toEqual(['ch-1', 'ch-2']);
            expect(result.map(row => row.lastNo)).toEqual([3, 7]);
            expect(result.map(row => row.chat?.id)).toEqual(['m3', 'm7']);
            expect(result.map(row => row.activity?.id)).toEqual(['m3', 'm7']);
        });

        it('keeps the preview on a top-level message while the activity is a newer thread reply', async () => {
            const chats = createPartitionedMemoryStorage('chat');
            const storage = chats.forScope(contextProvider.getContext());
            storage.loadLastPerChannel = jest.fn(async () => [
                {
                    channelId: 'ch-1',
                    lastNo: 6,
                    item: { id: 'top', channelId: 'ch-1', chatNo: 3 } as any,
                    activityItem: { id: 'reply', channelId: 'ch-1', chatNo: 6, parentId: '3' } as any,
                },
            ]);
            const dataSource = new ChatLocalDataSource(contextProvider as any, chats);

            const [row] = await dataSource.cacheReadLastList(['ch-1']);

            expect(row.chat?.id).toBe('top');
            expect(row.activity?.id).toBe('reply');
        });

        it('reads a channel through the window when the app answers without an activity row', async () => {
            const chats = createPartitionedMemoryStorage('chat');
            const storage = chats.forScope(contextProvider.getContext());
            storage.loadLastPerChannel = jest.fn(async () => [
                { channelId: 'ch-1', lastNo: 3, item: { id: 'm3', channelId: 'ch-1', chatNo: 3 } as any },
            ]);
            const dataSource = new ChatLocalDataSource(contextProvider as any, chats);
            await dataSource.cacheWriteMany([
                { id: 'm1', channelId: 'ch-1', chatNo: 1, content: 'top' } as any,
                { id: 'm2', channelId: 'ch-1', chatNo: 2, content: 'reply', parentId: '1' } as any,
            ]);

            const [row] = await dataSource.cacheReadLastList(['ch-1']);

            expect(row.chat?.id).toBe('m1');
            expect(row.activity?.id).toBe('m2');
        });

        it('falls back for a channel whose preview row is a thread reply', async () => {
            const chats = createPartitionedMemoryStorage('chat');
            const storage = chats.forScope(contextProvider.getContext());
            storage.loadLastPerChannel = jest.fn(async () => [
                {
                    channelId: 'ch-1',
                    lastNo: 2,
                    item: { id: 'm2', channelId: 'ch-1', chatNo: 2, parentId: '1' } as any,
                    activityItem: { id: 'm2', channelId: 'ch-1', chatNo: 2, parentId: '1' } as any,
                },
            ]);
            const dataSource = new ChatLocalDataSource(contextProvider as any, chats);
            await dataSource.cacheWriteMany([
                { id: 'm1', channelId: 'ch-1', chatNo: 1, content: 'top' } as any,
                { id: 'm2', channelId: 'ch-1', chatNo: 2, content: 'reply', parentId: '1' } as any,
            ]);

            const [row] = await dataSource.cacheReadLastList(['ch-1']);

            expect(row.chat?.id).toBe('m1');
        });

        it('falls back to the window scan when the storage cannot answer (old app / plain browser)', async () => {
            const chats = createPartitionedMemoryStorage('chat');
            const storage = chats.forScope(contextProvider.getContext());
            storage.loadLastPerChannel = jest.fn(async () => null);
            const dataSource = new ChatLocalDataSource(contextProvider as any, chats);

            await dataSource.cacheWriteMany([
                { id: 'm1', channelId: 'ch-1', chatNo: 1, content: 'a' } as any,
                { id: 'm2', channelId: 'ch-1', chatNo: 2, stereo: 'system', subType: 'reaction' } as any,
            ]);

            const result = await dataSource.cacheReadLastList(['ch-1']);

            expect(result).toEqual([
                expect.objectContaining({ channelId: 'ch-1', lastNo: 2, chat: expect.objectContaining({ id: 'm1' }) }),
            ]);
        });

        it('re-derives only the channels whose fast-path row fails the CURRENT preview rule', async () => {
            const chats = createPartitionedMemoryStorage('chat');
            const storage = chats.forScope(contextProvider.getContext());
            storage.loadLastPerChannel = jest.fn(async () => [
                {
                    channelId: 'ch-1',
                    lastNo: 5,
                    item: { id: 'bad', channelId: 'ch-1', chatNo: 5, stereo: 'system', subType: 'reaction' } as any,
                    activityItem: null,
                },
                {
                    channelId: 'ch-2',
                    lastNo: 9,
                    item: { id: 'ok', channelId: 'ch-2', chatNo: 9 } as any,
                    activityItem: { id: 'ok', channelId: 'ch-2', chatNo: 9 } as any,
                },
            ]);
            const dataSource = new ChatLocalDataSource(contextProvider as any, chats);

            await dataSource.cacheWriteMany([
                { id: 'm4', channelId: 'ch-1', chatNo: 4, content: 'real' } as any,
                { id: 'other', channelId: 'ch-2', chatNo: 1, content: 'must not be read' } as any,
            ]);

            const result = await dataSource.cacheReadLastList(['ch-1', 'ch-2']);

            expect(result.map(row => row.chat?.id)).toEqual(['m4', 'ok']);
            expect(result[1]?.lastNo).toBe(9);
        });

        it('a re-run in fallback mode re-reads every requested channel', async () => {
            const chats = createPartitionedMemoryStorage('chat');
            const storage = chats.forScope(contextProvider.getContext());
            const loadAllSpy = jest.spyOn(storage, 'loadAll');
            const dataSource = new ChatLocalDataSource(contextProvider as any, chats);
            await dataSource.cacheWriteMany([
                { id: 'a1', channelId: 'ch-1', chatNo: 1, content: 'a' } as any,
                { id: 'b1', channelId: 'ch-2', chatNo: 1, content: 'b' } as any,
            ]);

            loadAllSpy.mockClear();
            await dataSource.cacheReadLastList(['ch-1', 'ch-2']);
            expect(loadAllSpy).toHaveBeenCalledTimes(2);

            await dataSource.cacheWrite({ id: 'b2', channelId: 'ch-2', chatNo: 2, content: 'b2' } as any);
            loadAllSpy.mockClear();
            const result = await dataSource.cacheReadLastList(['ch-1', 'ch-2']);

            expect(loadAllSpy).toHaveBeenCalledTimes(2);
            expect(result.map(row => row.chat?.id)).toEqual(['a1', 'b2']);
        });

        it('a re-run after cacheClear discards the memo and re-reads everything', async () => {
            const chats = createPartitionedMemoryStorage('chat');
            const storage = chats.forScope(contextProvider.getContext());
            const loadAllSpy = jest.spyOn(storage, 'loadAll');
            const dataSource = new ChatLocalDataSource(contextProvider as any, chats);
            await dataSource.cacheWriteMany([{ id: 'a1', channelId: 'ch-1', chatNo: 1, content: 'a' } as any]);

            await dataSource.cacheReadLastList(['ch-1']);
            await dataSource.cacheClear();
            loadAllSpy.mockClear();

            const result = await dataSource.cacheReadLastList(['ch-1']);

            expect(loadAllSpy).toHaveBeenCalledTimes(1);
            expect(result).toEqual([{ channelId: 'ch-1', lastNo: 0, chat: null, activity: null }]);
        });

        it('keeps an empty channel as a valid "nothing to preview" answer without falling back', async () => {
            const chats = createPartitionedMemoryStorage('chat');
            const storage = chats.forScope(contextProvider.getContext());
            storage.loadLastPerChannel = jest.fn(async () => [
                { channelId: 'ch-1', lastNo: 0, item: null, activityItem: null },
            ]);
            const fallbackSpy = jest.spyOn(storage, 'loadAll');
            const dataSource = new ChatLocalDataSource(contextProvider as any, chats);

            const result = await dataSource.cacheReadLastList(['ch-1']);

            expect(result).toEqual([{ channelId: 'ch-1', lastNo: 0, chat: null, activity: null }]);
            expect(fallbackSpy).not.toHaveBeenCalled();
        });
    });

    describe('observeLastList (ADR-0057)', () => {
        it('re-emits the combined observer on any chat write and delivers the fresh preview', async () => {
            const chats = createPartitionedMemoryStorage('chat');
            const dataSource = new ChatLocalDataSource(contextProvider as any, chats);

            await dataSource.cacheWrite({ id: 'm1', channelId: 'ch-1', chatNo: 1, content: 'old' } as any);
            await new Promise(resolve => setTimeout(resolve, 80));

            const emissions: Array<Array<{ channelId: string; chat: { id?: string } | null }>> = [];
            const unsubscribe = dataSource.observeLastList(['ch-1', 'ch-2'], rows => emissions.push(rows));
            await new Promise(resolve => setTimeout(resolve, 20));

            expect(emissions[0]?.map(row => row.chat?.id)).toEqual(['m1', undefined]);

            await dataSource.cacheWrite({ id: 'm2', channelId: 'ch-2', chatNo: 4, content: 'new' } as any);
            await new Promise(resolve => setTimeout(resolve, 80));

            const latest = emissions[emissions.length - 1];
            expect(emissions.length).toBeGreaterThan(1);
            expect(latest?.map(row => row.chat?.id)).toEqual(['m1', 'm2']);

            unsubscribe();
        });
    });

    it('supports cursor-based paging for older messages instead of returning the latest page again', async () => {
        const chats = createPartitionedMemoryStorage('chat');
        const dataSource = new ChatLocalDataSource(contextProvider as any, chats);

        await dataSource.cacheWriteMany([
            { id: 'm1', channelId: 'ch-1', chatNo: 1, content: 'a' } as any,
            { id: 'm2', channelId: 'ch-1', chatNo: 2, content: 'b' } as any,
            { id: 'm3', channelId: 'ch-1', chatNo: 3, content: 'c' } as any,
        ]);

        const olderPage = await dataSource.cacheReadList({ channelId: 'ch-1', cursorNo: 3, limit: 2 } as any);

        expect(olderPage?.list.map(item => item.id)).toEqual(['m1', 'm2']);
    });

    it('keeps a single far-older cached row out of the newest page', async () => {
        const chats = createPartitionedMemoryStorage('chat');
        const dataSource = new ChatLocalDataSource(contextProvider as any, chats);

        await dataSource.cacheWriteMany([
            { id: 'm5', channelId: 'ch-1', chatNo: 5, content: 'old thread root' } as any,
            { id: 'm98', channelId: 'ch-1', chatNo: 98, content: 'a' } as any,
            { id: 'm99', channelId: 'ch-1', chatNo: 99, content: 'b' } as any,
            { id: 'm100', channelId: 'ch-1', chatNo: 100, content: 'c' } as any,
        ]);

        const newest = await dataSource.cacheReadList({ channelId: 'ch-1', limit: 3 } as any);

        expect(newest?.list.map(item => item.id)).toEqual(['m98', 'm99', 'm100']);
    });
});
