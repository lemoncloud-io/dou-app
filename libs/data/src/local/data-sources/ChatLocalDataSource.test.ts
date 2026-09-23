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
        // The initial read should only include the requested channel.
        expect(beforeClear?.list.map(item => item.id)).toEqual(['m1', 'm2']);

        await dataSource.cacheClearByChannelId('ch-1');

        const afterClear = await dataSource.cacheReadList({ channelId: 'ch-1', limit: 50 } as any);
        const otherChannel = await dataSource.cacheReadList({ channelId: 'ch-2', limit: 50 } as any);

        // Clearing one channel must not remove messages from other channels in the same scope.
        expect(afterClear?.list).toEqual([]);
        expect(otherChannel?.list.map(item => item.id)).toEqual(['m3']);
    });

    it('a channel purge under a captured scope empties that scope only, even when the session has moved on', async () => {
        const chats = createPartitionedMemoryStorage('chat');
        const provider = { getContext: () => ({ cid: 'cloud-b', uid: 'me' }), setContext: () => undefined };
        const dataSource = new ChatLocalDataSource(provider, chats);
        // Channel ids are per cloud, so the same id can name a room in each.
        await dataSource.cacheWrite({ id: 'a-1', channelId: 'ch-1', chatNo: 1 } as any, { cid: 'cloud-a', uid: 'me' });
        await dataSource.cacheWrite({ id: 'b-1', channelId: 'ch-1', chatNo: 1 } as any);

        // A leave confirmed for cloud A, arriving after the switch to cloud B.
        await dataSource.cacheClearByChannelId('ch-1', { cid: 'cloud-a', uid: 'me' });

        // Chat history cannot be fetched back once gone, so the wrong partition here is permanent.
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
                // The response order can differ from the requested order — returned reversed, per the contract.
                { channelId: 'ch-2', lastNo: 7, item: { id: 'm7', channelId: 'ch-2', chatNo: 7 } as any },
                { channelId: 'ch-1', lastNo: 3, item: { id: 'm3', channelId: 'ch-1', chatNo: 3 } as any },
            ]);
            const dataSource = new ChatLocalDataSource(contextProvider as any, chats);

            const result = await dataSource.cacheReadLastList(['ch-1', 'ch-2']);

            expect(storage.loadLastPerChannel).toHaveBeenCalledWith(['ch-1', 'ch-2']);
            expect(result.map(row => row.channelId)).toEqual(['ch-1', 'ch-2']);
            expect(result.map(row => row.lastNo)).toEqual([3, 7]);
            expect(result.map(row => row.chat?.id)).toEqual(['m3', 'm7']);
        });

        it('falls back to the window scan when the storage cannot answer (old app / plain browser)', async () => {
            const chats = createPartitionedMemoryStorage('chat');
            const storage = chats.forScope(contextProvider.getContext());
            storage.loadLastPerChannel = jest.fn(async () => null);
            const dataSource = new ChatLocalDataSource(contextProvider as any, chats);

            await dataSource.cacheWriteMany([
                { id: 'm1', channelId: 'ch-1', chatNo: 1, content: 'a' } as any,
                // The newest row is a reaction event: lastNo must still count it while the
                // preview falls through to the real message below it.
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
                // The app (older semantics) answered with a reaction event as the preview — only this channel should fall back.
                {
                    channelId: 'ch-1',
                    lastNo: 5,
                    item: { id: 'bad', channelId: 'ch-1', chatNo: 5, stereo: 'system', subType: 'reaction' } as any,
                },
                { channelId: 'ch-2', lastNo: 9, item: { id: 'ok', channelId: 'ch-2', chatNo: 9 } as any },
            ]);
            const dataSource = new ChatLocalDataSource(contextProvider as any, chats);

            await dataSource.cacheWriteMany([
                { id: 'm4', channelId: 'ch-1', chatNo: 4, content: 'real' } as any,
                { id: 'other', channelId: 'ch-2', chatNo: 1, content: 'must not be read' } as any,
            ]);

            const result = await dataSource.cacheReadLastList(['ch-1', 'ch-2']);

            expect(result.map(row => row.chat?.id)).toEqual(['m4', 'ok']);
            // ch-2 has to keep the fast path's answer — if the fallback overwrote lastNo from the cache
            // (1 < 9) the head trigger would misread a row it already has as a shortfall.
            expect(result[1]?.lastNo).toBe(9);
        });

        it('a re-run in fallback mode re-reads every requested channel', async () => {
            const chats = createPartitionedMemoryStorage('chat');
            const storage = chats.forScope(contextProvider.getContext()); // no loadLastPerChannel = fallback mode
            const loadAllSpy = jest.spyOn(storage, 'loadAll');
            const dataSource = new ChatLocalDataSource(contextProvider as any, chats);
            await dataSource.cacheWriteMany([
                { id: 'a1', channelId: 'ch-1', chatNo: 1, content: 'a' } as any,
                { id: 'b1', channelId: 'ch-2', chatNo: 1, content: 'b' } as any,
            ]);

            loadAllSpy.mockClear();
            await dataSource.cacheReadLastList(['ch-1', 'ch-2']);
            // The first run has no baseline, so it reads every channel.
            expect(loadAllSpy).toHaveBeenCalledTimes(2);

            await dataSource.cacheWrite({ id: 'b2', channelId: 'ch-2', chatNo: 2, content: 'b2' } as any);
            loadAllSpy.mockClear();
            const result = await dataSource.cacheReadLastList(['ch-1', 'ch-2']);

            // It now recomputes the requested set as given, with no per-channel dirty tracking.
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
            expect(result).toEqual([{ channelId: 'ch-1', lastNo: 0, chat: null }]);
        });

        it('keeps an empty channel as a valid "nothing to preview" answer without falling back', async () => {
            const chats = createPartitionedMemoryStorage('chat');
            const storage = chats.forScope(contextProvider.getContext());
            storage.loadLastPerChannel = jest.fn(async () => [{ channelId: 'ch-1', lastNo: 0, item: null }]);
            const fallbackSpy = jest.spyOn(storage, 'loadAll');
            const dataSource = new ChatLocalDataSource(contextProvider as any, chats);

            const result = await dataSource.cacheReadLastList(['ch-1']);

            expect(result).toEqual([{ channelId: 'ch-1', lastNo: 0, chat: null }]);
            expect(fallbackSpy).not.toHaveBeenCalled();
        });
    });

    describe('observeLastList (ADR-0057)', () => {
        it('re-emits the combined observer on any chat write and delivers the fresh preview', async () => {
            const chats = createPartitionedMemoryStorage('chat');
            const dataSource = new ChatLocalDataSource(contextProvider as any, chats);

            await dataSource.cacheWrite({ id: 'm1', channelId: 'ch-1', chatNo: 1, content: 'old' } as any);
            await new Promise(resolve => setTimeout(resolve, 80)); // past the flush timer (50ms)

            const emissions: Array<Array<{ channelId: string; chat: { id?: string } | null }>> = [];
            const unsubscribe = dataSource.observeLastList(['ch-1', 'ch-2'], rows => emissions.push(rows));
            await new Promise(resolve => setTimeout(resolve, 20)); // let the first subscription query settle

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

        // A cursor should page older messages instead of repeating the live tail.
        expect(olderPage?.list.map(item => item.id)).toEqual(['m1', 'm2']);
    });
});
