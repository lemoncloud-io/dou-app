import { CloudLocalDataSource } from './CloudLocalDataSource';
import { createPartitionedMemoryStorage } from './__mocks__/MemoryCacheStorage';

const flushPromises = async () => {
    await Promise.resolve();
    await Promise.resolve();
};

describe('CloudLocalDataSource', () => {
    const contextProvider = {
        current: { cid: 'cloud-a', sid: 'site-1', uid: 'me' },
        getContext() {
            return this.current;
        },
        setContext(context: any) {
            this.current = context;
        },
    };

    beforeEach(() => {
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('re-emits the cloud list after a mutation so the local-first repository stays reactive', async () => {
        const storage = createPartitionedMemoryStorage('invitecloud');
        const dataSource = new CloudLocalDataSource(contextProvider as any, storage);
        const totals: number[] = [];

        const unsubscribe = dataSource.observeList(undefined as void, result => {
            totals.push(result?.meta.total ?? 0);
        });

        jest.runAllTimers();
        await flushPromises();

        await dataSource.cacheWrite({ id: 'cloud-1', cid: 'cloud-1', name: 'Cloud One' } as any);

        jest.runAllTimers();
        await flushPromises();

        unsubscribe();

        expect(totals).toEqual([0, 1]);
    });

    it('clears all clouds so local state can be reset between sessions', async () => {
        const storage = createPartitionedMemoryStorage('invitecloud');
        const dataSource = new CloudLocalDataSource(contextProvider as any, storage);

        await dataSource.cacheWriteMany([
            { id: 'cloud-1', cid: 'cloud-1', name: 'One' } as any,
            { id: 'cloud-2', cid: 'cloud-2', name: 'Two' } as any,
        ]);
        await dataSource.cacheClear();

        const result = await dataSource.cacheReadList();

        expect(result?.list).toEqual([]);
    });

    it('defaults an unclassified write to the invited cloudType and preserves an explicit one', async () => {
        const storage = createPartitionedMemoryStorage('invitecloud');
        const dataSource = new CloudLocalDataSource(contextProvider as any, storage);

        await dataSource.cacheWrite({ id: 'cloud-1', cid: 'cloud-1', name: 'One' } as any);
        await dataSource.cacheWrite({ id: 'cloud-2', cid: 'cloud-2', name: 'Two', cloudType: 'owner' } as any);

        expect((await dataSource.cacheRead('cloud-1'))?.cloudType).toBe('invited');
        expect((await dataSource.cacheRead('cloud-2'))?.cloudType).toBe('owner');
    });
});
