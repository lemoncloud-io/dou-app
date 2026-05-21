import type { CacheStorage } from '../storages';
import { InviteCloudLocalDataSource } from './InviteCloudLocalDataSource';

// 대기 중인 모든 Promise(마이크로태스크)를 처리하도록 기다려주는 유틸리티
const flushPromises = async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
};

const createMemoryStorage = (): CacheStorage<'invitecloud'> => {
    const map = new Map<string, any>();
    return {
        async save(id, item) {
            map.set(id, { ...item });
            return item;
        },
        async saveAll(items) {
            items.forEach(item => {
                if (item?.id) map.set(item.id, { ...item });
            });
            return items;
        },
        async load(id) {
            return map.has(id) ? { ...map.get(id) } : null;
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
    };
};

describe('InviteCloudLocalDataSource', () => {
    const contextProvider = {
        current: { cid: 'cloud-a', uid: 'user-a' },
        getContext() {
            return this.current;
        },
        setContext(context: any) {
            this.current = context;
        },
    };

    // 💡 필수: 가짜 타이머 설정 (Debounce 처리를 위해 필요)
    beforeEach(() => {
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('saves and loads invite cloud records', async () => {
        const storage = createMemoryStorage();
        const dataSource = new InviteCloudLocalDataSource(contextProvider as any, storage);

        await dataSource.upsert({ id: 'i1', name: 'Cloud One', cid: 'cloud-a' } as any);
        const loaded = await dataSource.getById('i1');

        expect(loaded?.id).toBe('i1');
        expect(loaded?.name).toBe('Cloud One');
    });

    it('re-emits subscribed invite cloud list when cache is mutated', async () => {
        const storage = createMemoryStorage();
        const dataSource = new InviteCloudLocalDataSource(contextProvider as any, storage);
        const emissions: number[] = [];

        // 1. 구독 시작 (초기 상태이므로 0 방출 대기)
        const unsubscribe = dataSource.subscribeList(undefined, result => {
            emissions.push(result?.meta?.total ?? 0);
        });

        jest.runAllTimers();
        await flushPromises();

        // 2. 데이터 추가 (1 방출 기대)
        await dataSource.upsert({ id: 'i1', name: 'Cloud One', cid: 'cloud-a' } as any);

        jest.runAllTimers(); // debounce 타이머 실행
        await flushPromises(); // 내부 비동기 fetch 완료 대기

        // 3. 데이터 삭제 (0 방출 기대)
        await dataSource.remove('i1');

        jest.runAllTimers(); // debounce 타이머 실행
        await flushPromises(); // 내부 비동기 fetch 완료 대기

        unsubscribe();

        expect(emissions).toEqual([0, 1, 0]);
    });
});
