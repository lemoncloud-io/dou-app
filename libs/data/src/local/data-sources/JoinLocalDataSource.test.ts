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
