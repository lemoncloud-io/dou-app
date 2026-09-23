import { UserLocalDataSource } from './UserLocalDataSource';
import { createPartitionedMemoryStorage } from './__mocks__/MemoryCacheStorage';

describe('UserLocalDataSource', () => {
    const contextProvider = {
        current: { cid: 'cloud-a', sid: 'site-1', uid: 'me' },
        getContext() {
            return this.current;
        },
        setContext(context: any) {
            this.current = context;
        },
    };

    it('filters channel members by membership in the mapped channelIds', async () => {
        const storage = createPartitionedMemoryStorage('user');
        const dataSource = new UserLocalDataSource(contextProvider as any, storage);

        // Channel membership arrives pre-mapped as `channelIds` (resolved upstream from channelId/$join).
        await dataSource.cacheWriteMany([
            { id: 'u1', channelIds: ['ch-1'], name: 'Direct' } as any,
            { id: 'u2', channelIds: ['ch-1'], name: 'Nested' } as any,
            { id: 'u3', channelIds: ['ch-2'], name: 'Other' } as any,
        ]);

        const result = await dataSource.cacheReadList({ channelId: 'ch-1' } as any);

        expect(result?.list.map(item => item.id)).toEqual(['u1', 'u2']);
    });

    it('reads multiple users by id in one call so higher-level assemblers can hydrate batched lookups', async () => {
        const storage = createPartitionedMemoryStorage('user');
        const dataSource = new UserLocalDataSource(contextProvider as any, storage);

        await dataSource.cacheWriteMany([{ id: 'u1', name: 'One' } as any, { id: 'u2', name: 'Two' } as any]);

        const users = await dataSource.cacheReadMany(['u1', 'u2']);

        // Batched reads should preserve the requested set without forcing callers into N single-item reads.
        //
        // Asserted as a set — order is not part of the contract. On native this goes down as a single
        // `id IN (...)` and uses whatever order SQLite returns, so matching the requested order cannot be
        // promised. (The fixture deliberately returns them reversed for the same reason: to keep this
        // assertion from leaning on order.)
        expect(users.map(user => user.id).sort()).toEqual(['u1', 'u2']);
    });

    it('drops ids that are not cached instead of returning holes, so callers can index by id', async () => {
        const storage = createPartitionedMemoryStorage('user');
        const dataSource = new UserLocalDataSource(contextProvider as any, storage);

        await dataSource.cacheWriteMany([{ id: 'u1', name: 'One' } as any]);

        const users = await dataSource.cacheReadMany(['u1', 'missing']);

        expect(users.map(user => user.id)).toEqual(['u1']);
    });
});
