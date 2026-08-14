import type { CacheStorage } from '../storages';
import { InviteLocalDataSourceV2 } from './InviteLocalDataSourceV2';

const createMemoryStorage = (): CacheStorage<'invite'> => {
    const map = new Map<string, any>();
    return {
        async save(id, item) {
            map.set(id, { ...item });
            return item;
        },
        async saveAll(items) {
            items.forEach(item => item?.id && map.set(item.id, { ...item }));
            return items;
        },
        async load(id) {
            return map.has(id) ? { ...map.get(id) } : null;
        },
        async loadMany(ids) {
            // 계약대로 없는 id는 빼고, 순서도 보장하지 않습니다(뒤집어 돌려줍니다) — 위치로 짝을
            // 맞추는 코드가 여기서 반드시 깨지도록 두는 것이 이 fixture의 역할입니다.
            return ids
                .filter(id => map.has(id))
                .map(id => ({ ...map.get(id) }))
                .reverse();
        },
        async loadAll() {
            return Array.from(map.values()).map(item => ({ ...item }));
        },
        async delete(id) {
            map.delete(id);
        },
        async deleteAll(ids) {
            ids.forEach(id => map.delete(id));
        },
        async clearAll() {
            map.clear();
        },
        async clearByChannelId() {
            return undefined;
        },
    };
};

const contextProvider = {
    current: { cid: 'default', uid: 'u1' },
    getContext() {
        return this.current;
    },
    setContext(context: any) {
        this.current = context;
    },
};

describe('InviteLocalDataSourceV2', () => {
    it('sorts by createdAt descending (newest first), matching invite.list order', async () => {
        const storage = createMemoryStorage();
        const dataSource = new InviteLocalDataSourceV2(contextProvider as any, storage);

        await dataSource.cacheWriteMany([
            { id: 'old', createdAt: 100 } as any,
            { id: 'newest', createdAt: 300 } as any,
            { id: 'mid', createdAt: 200 } as any,
        ]);

        const result = await dataSource.cacheReadList(undefined);

        expect(result?.list.map(item => item.id)).toEqual(['newest', 'mid', 'old']);
    });

    it('tie-breaks equal/missing createdAt by id descending, deterministically', async () => {
        const storage = createMemoryStorage();
        const dataSource = new InviteLocalDataSourceV2(contextProvider as any, storage);

        await dataSource.cacheWriteMany([{ id: 'a' } as any, { id: 'b' } as any, { id: 'c' } as any]);

        const result = await dataSource.cacheReadList(undefined);

        expect(result?.list.map(item => item.id)).toEqual(['c', 'b', 'a']);
    });

    // The core "response is authoritative, dismiss survives" guarantee (ADR-0052 결정 4·5): a
    // list-sync write never mentions `dismissedAt`, so the merge in cacheWriteMany leaves it alone.
    describe('list-sync overwrite preserves dismissedAt', () => {
        it('cacheWriteMany overwrites server-owned fields but keeps a local dismissedAt stamp', async () => {
            const storage = createMemoryStorage();
            const dataSource = new InviteLocalDataSourceV2(contextProvider as any, storage);

            await dataSource.cacheWrite({ id: 'i1', state: 'rejected' } as any);
            await dataSource.cacheWrite({ id: 'i1', dismissedAt: 1000 } as any);

            // A fresh invite.list response for the same id, with an updated state and no
            // dismissedAt key at all (as toCacheInviteView never emits one).
            await dataSource.cacheWriteMany([{ id: 'i1', state: 'rejected', name: 'Updated Name' } as any]);

            const result = await dataSource.cacheRead('i1');
            expect(result?.dismissedAt).toBe(1000);
            expect(result?.name).toBe('Updated Name');
        });

        it('cacheWrite (single) also preserves fields the patch omits', async () => {
            const storage = createMemoryStorage();
            const dataSource = new InviteLocalDataSourceV2(contextProvider as any, storage);

            await dataSource.cacheWrite({ id: 'i1', state: 'pending', name: 'Alice' } as any);
            await dataSource.cacheWrite({ id: 'i1', dismissedAt: 500 } as any);

            const result = await dataSource.cacheRead('i1');
            expect(result?.state).toBe('pending');
            expect(result?.name).toBe('Alice');
            expect(result?.dismissedAt).toBe(500);
        });
    });

    it('never deletes rows outside a list-sync batch — cacheWriteMany only upserts', async () => {
        const storage = createMemoryStorage();
        const dataSource = new InviteLocalDataSourceV2(contextProvider as any, storage);

        await dataSource.cacheWriteMany([{ id: 'windowed-out', createdAt: 1 } as any]);
        // A subsequent sync only returns a different id (simulating the row falling out the window).
        await dataSource.cacheWriteMany([{ id: 'fresh', createdAt: 2 } as any]);

        const result = await dataSource.cacheReadList(undefined);
        expect(result?.list.map(item => item.id).sort()).toEqual(['fresh', 'windowed-out']);
    });

    it('cacheDelete removes a single row (used to drain a reconciled dismiss stub)', async () => {
        const storage = createMemoryStorage();
        const dataSource = new InviteLocalDataSourceV2(contextProvider as any, storage);

        await dataSource.cacheWrite({ id: 'stub-1', dismissedAt: 1 } as any);
        await dataSource.cacheDelete('stub-1');

        expect(await dataSource.cacheRead('stub-1')).toBeNull();
    });

    it('cacheWrite/cacheWriteMany stamp the current cid/uid scope', async () => {
        const storage = createMemoryStorage();
        const dataSource = new InviteLocalDataSourceV2(contextProvider as any, storage);

        await dataSource.cacheWrite({ id: 'i1' } as any);

        const result = await dataSource.cacheRead('i1');
        expect(result?.cid).toBe('default');
        expect(result?.uid).toBe('u1');
    });

    it('cacheClear empties the scope', async () => {
        const storage = createMemoryStorage();
        const dataSource = new InviteLocalDataSourceV2(contextProvider as any, storage);

        await dataSource.cacheWriteMany([{ id: 'i1' } as any, { id: 'i2' } as any]);
        await dataSource.cacheClear();

        const result = await dataSource.cacheReadList(undefined);
        expect(result?.list).toEqual([]);
    });

    describe('observeList reemits on write', () => {
        const flush = async () => {
            await jest.advanceTimersByTimeAsync(60);
        };
        beforeEach(() => jest.useFakeTimers());
        afterEach(() => jest.useRealTimers());

        it('notifies subscribers after a cacheWriteMany', async () => {
            const storage = createMemoryStorage();
            const dataSource = new InviteLocalDataSourceV2(contextProvider as any, storage);

            const cb = jest.fn();
            dataSource.observeList(undefined, cb);
            await flush();
            cb.mockClear();

            await dataSource.cacheWriteMany([{ id: 'i1', createdAt: 1 } as any]);
            await flush();

            expect(cb).toHaveBeenCalled();
            const lastArg = cb.mock.calls.at(-1)?.[0];
            expect(lastArg?.list.map((item: any) => item.id)).toEqual(['i1']);
        });
    });
});
