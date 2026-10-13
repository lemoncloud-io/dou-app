import { JoinLocalDataSource } from './JoinLocalDataSource';
import { createPartitionedMemoryStorage } from './__mocks__/MemoryCacheStorage';

describe('JoinLocalDataSource', () => {
    const contextProvider = {
        current: { cid: 'cloud-a', sid: 'site-1', uid: 'me' },
        getContext() {
            return this.current;
        },
        setContext(context: any) {
            this.current = context;
        },
    };

    it('filters by channel and activeOnly so archived joins do not leak into active views', async () => {
        const storage = createPartitionedMemoryStorage('join');
        const dataSource = new JoinLocalDataSource(contextProvider as any, storage);

        await dataSource.cacheWriteMany([
            { id: 'j1', channelId: 'ch-1', userId: 'u1', joined: 1 } as any,
            { id: 'j2', channelId: 'ch-1', userId: 'u2', joined: 0 } as any,
            { id: 'j3', channelId: 'ch-2', userId: 'u3', joined: 1 } as any,
        ]);

        const result = await dataSource.cacheReadList({ channelId: 'ch-1', activeOnly: true });

        // activeOnly should filter out archived membership rows for the same channel.
        expect(result?.list.map(item => item.id)).toEqual(['j1']);
    });

    it('throws when join list input is missing channelId instead of masking the caller bug', async () => {
        const storage = createPartitionedMemoryStorage('join');
        const dataSource = new JoinLocalDataSource(contextProvider as any, storage);

        await expect(dataSource.cacheReadList({ activeOnly: true } as any)).rejects.toThrow(
            '[LocalDataSource] channelId is required.'
        );
    });

    describe('read cursor', () => {
        const readCursor = async (dataSource: JoinLocalDataSource) =>
            (await dataSource.cacheReadList({ channelId: 'ch-1', activeOnly: false }))?.list[0];

        it('keeps the stored cursor and its metaNo when a late answer carries an older one', async () => {
            const dataSource = new JoinLocalDataSource(contextProvider as any, createPartitionedMemoryStorage('join'));
            await dataSource.cacheWrite({
                id: 'j1',
                channelId: 'ch-1',
                userId: 'me',
                readNo: 20,
                chatNo: 20,
                metaNo: 3,
            });

            // A join sync that left before the read lands after it.
            await dataSource.cacheWrite({
                id: 'j1',
                channelId: 'ch-1',
                userId: 'me',
                readNo: 12,
                chatNo: 12,
                metaNo: 1,
                notify: false,
            } as any);

            expect(await readCursor(dataSource)).toEqual(
                expect.objectContaining({ readNo: 20, chatNo: 20, metaNo: 3, notify: false })
            );
        });

        it('advances when the incoming cursor is ahead', async () => {
            const dataSource = new JoinLocalDataSource(contextProvider as any, createPartitionedMemoryStorage('join'));
            await dataSource.cacheWrite({
                id: 'j1',
                channelId: 'ch-1',
                userId: 'me',
                readNo: 20,
                chatNo: 20,
                metaNo: 3,
            });

            await dataSource.cacheWrite({ id: 'j1', channelId: 'ch-1', userId: 'me', chatNo: 25, metaNo: 4 });

            expect(await readCursor(dataSource)).toEqual(expect.objectContaining({ chatNo: 25, metaNo: 4 }));
        });

        it('leaves the cursor alone when the write carries none', async () => {
            const dataSource = new JoinLocalDataSource(contextProvider as any, createPartitionedMemoryStorage('join'));
            await dataSource.cacheWrite({ id: 'j1', channelId: 'ch-1', userId: 'me', readNo: 20, chatNo: 20 });

            await dataSource.cacheWrite({ id: 'j1', channelId: 'ch-1', userId: 'me', notify: true } as any);

            expect(await readCursor(dataSource)).toEqual(
                expect.objectContaining({ readNo: 20, chatNo: 20, notify: true })
            );
        });

        it('applies the same rule to a bulk write', async () => {
            const dataSource = new JoinLocalDataSource(contextProvider as any, createPartitionedMemoryStorage('join'));
            await dataSource.cacheWrite({ id: 'j1', channelId: 'ch-1', userId: 'me', readNo: 20, chatNo: 20 });

            await dataSource.cacheWriteMany([{ id: 'j1', channelId: 'ch-1', userId: 'me', readNo: 8, chatNo: 8 }]);

            expect(await readCursor(dataSource)).toEqual(expect.objectContaining({ readNo: 20, chatNo: 20 }));
        });
    });

    it('deletes multiple joins in one call so channel membership snapshots can be reconciled in bulk', async () => {
        const storage = createPartitionedMemoryStorage('join');
        const dataSource = new JoinLocalDataSource(contextProvider as any, storage);

        await dataSource.cacheWriteMany([
            { id: 'j1', channelId: 'ch-1', userId: 'u1', joined: 1 } as any,
            { id: 'j2', channelId: 'ch-1', userId: 'u2', joined: 1 } as any,
        ]);
        await dataSource.cacheDeleteMany(['j1', 'j2']);

        const result = await dataSource.cacheReadList({ channelId: 'ch-1', activeOnly: false });

        // Bulk delete should remove every targeted row from the next channel snapshot.
        expect(result?.list).toEqual([]);
    });
});
