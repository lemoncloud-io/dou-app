import type { CacheStorage } from '../storages';
import { UserLocalDataSourceV2 } from './UserLocalDataSourceV2';

/**
 * 옵저버가 저장소를 몇 번 읽는지에 대한 계약.
 *
 * 옵저버 알림은 저장소를 다시 읽으므로(`callback(await query())`) 읽기 한 번이 네이티브에서는 브릿지
 * 왕복 한 번입니다. 그룹핑은 재emit을 합쳤지만 **마운트는 각자 읽었고**, 한 화면이 훅 여러 개로
 * 같은 데이터를 보는 구조에서 진입 한 번에 그 수만큼 왕복이 났습니다. 여기서 세 경로를 고정합니다:
 * 값이 이미 있을 때, 읽는 중일 때, 아무것도 없을 때.
 */
const flushPromises = async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
};

interface Counters {
    loadAll: number;
    load: number;
}

const createMemoryStorage = (counters: Counters, gate?: { block: Promise<void> }): CacheStorage<'user'> => {
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
            counters.load += 1;
            if (gate) await gate.block;
            return map.has(id) ? { ...map.get(id) } : null;
        },
        async loadMany(ids) {
            return ids.filter(id => map.has(id)).map(id => ({ ...map.get(id) }));
        },
        async loadAll() {
            counters.loadAll += 1;
            if (gate) await gate.block;
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

const createContextProvider = (context: Record<string, unknown>) => ({
    current: context,
    getContext() {
        return this.current;
    },
    setContext(next: any) {
        this.current = next;
    },
});

describe('observer group sharing', () => {
    it('같은 키의 두 번째 구독자는 저장소를 다시 읽지 않고 그룹의 값을 받는다', async () => {
        const counters: Counters = { loadAll: 0, load: 0 };
        const dataSource = new UserLocalDataSourceV2(
            createContextProvider({ cid: 'c', sid: 's', uid: 'u' }) as any,
            createMemoryStorage(counters)
        );
        await dataSource.cacheWrite({ id: 'u1', channelIds: ['ch-1'] } as any);
        counters.loadAll = 0;

        const first = jest.fn();
        dataSource.observeList({ channelId: 'ch-1' } as any, first);
        await flushPromises();
        expect(counters.loadAll).toBe(1);

        const second = jest.fn();
        dataSource.observeList({ channelId: 'ch-1' } as any, second);
        await flushPromises();

        // 두 번째 구독자도 값을 받지만 저장소는 다시 읽히지 않았습니다.
        expect(second).toHaveBeenCalledTimes(1);
        expect(second.mock.calls[0][0]?.list.map((item: any) => item.id)).toEqual(['u1']);
        expect(counters.loadAll).toBe(1);
    });

    it('읽는 중에 붙은 구독자는 진행 중인 읽기에 합류한다 — 마운트가 몰려도 왕복은 한 번', async () => {
        const counters: Counters = { loadAll: 0, load: 0 };
        let release: () => void = () => undefined;
        const gate = {
            block: new Promise<void>(resolve => {
                release = resolve;
            }),
        };
        const dataSource = new UserLocalDataSourceV2(
            createContextProvider({ cid: 'c', sid: 's', uid: 'u' }) as any,
            createMemoryStorage(counters, gate)
        );

        const first = jest.fn();
        const second = jest.fn();
        const third = jest.fn();
        dataSource.observeList({ channelId: 'ch-1' } as any, first);
        dataSource.observeList({ channelId: 'ch-1' } as any, second);
        dataSource.observeList({ channelId: 'ch-1' } as any, third);

        release();
        await flushPromises();

        expect(first).toHaveBeenCalledTimes(1);
        expect(second).toHaveBeenCalledTimes(1);
        expect(third).toHaveBeenCalledTimes(1);
        expect(counters.loadAll).toBe(1);
    });

    it('재emit 결과가 그룹에 기억되므로, 그 뒤에 붙는 구독자는 최신 값을 읽기 없이 받는다', async () => {
        const counters: Counters = { loadAll: 0, load: 0 };
        const dataSource = new UserLocalDataSourceV2(
            createContextProvider({ cid: 'c', sid: 's', uid: 'u' }) as any,
            createMemoryStorage(counters)
        );

        const first = jest.fn();
        dataSource.observeList({ channelId: 'ch-1' } as any, first);
        await flushPromises();

        await dataSource.cacheWrite({ id: 'u1', channelIds: ['ch-1'] } as any);
        await new Promise(resolve => setTimeout(resolve, 80)); // flush 타이머(50ms) 통과
        counters.loadAll = 0;

        const second = jest.fn();
        dataSource.observeList({ channelId: 'ch-1' } as any, second);
        await flushPromises();

        expect(second.mock.calls[0][0]?.list.map((item: any) => item.id)).toEqual(['u1']);
        expect(counters.loadAll).toBe(0);
    });

    it('마지막 구독자가 떠난 뒤 다시 붙으면 값이 없으므로 새로 읽는다', async () => {
        const counters: Counters = { loadAll: 0, load: 0 };
        const dataSource = new UserLocalDataSourceV2(
            createContextProvider({ cid: 'c', sid: 's', uid: 'u' }) as any,
            createMemoryStorage(counters)
        );

        const unsubscribe = dataSource.observeList({ channelId: 'ch-1' } as any, jest.fn());
        await flushPromises();
        unsubscribe();
        counters.loadAll = 0;

        dataSource.observeList({ channelId: 'ch-1' } as any, jest.fn());
        await flushPromises();

        expect(counters.loadAll).toBe(1);
    });
});

describe('item observer scope isolation', () => {
    it('scope가 다른 같은 id 관찰은 서로 다른 그룹이다 — 남의 클라우드 데이터를 받지 않는다', async () => {
        const counters: Counters = { loadAll: 0, load: 0 };
        const provider = createContextProvider({ cid: 'cloud-a', sid: 's', uid: 'u' });
        const dataSource = new UserLocalDataSourceV2(provider as any, createMemoryStorage(counters));

        const fromCloudA = jest.fn();
        const fromCloudB = jest.fn();
        // 같은 id, 다른 scope. 예전에는 raw id가 키였으므로 두 번째가 첫 번째의 query 클로저를
        // 물려받아 cloud-a의 데이터를 받았습니다.
        dataSource.observeItem('u1', fromCloudA, { cid: 'cloud-a' });
        dataSource.observeItem('u1', fromCloudB, { cid: 'cloud-b' });
        await flushPromises();

        // 그룹이 갈렸다는 증거: 두 구독자가 각자 읽었다(공유 그룹이면 1회로 접혔을 것).
        expect(counters.load).toBe(2);
    });

    it('쓰기와 관찰이 같은 scope 키를 만들므로 재emit이 도착한다', async () => {
        const counters: Counters = { loadAll: 0, load: 0 };
        const provider = createContextProvider({ cid: 'cloud-a', sid: 's', uid: 'u' });
        const dataSource = new UserLocalDataSourceV2(provider as any, createMemoryStorage(counters));

        const observer = jest.fn();
        dataSource.observeItem('u1', observer);
        await flushPromises();
        observer.mockClear();

        await dataSource.cacheWrite({ id: 'u1', name: 'named' } as any);
        await new Promise(resolve => setTimeout(resolve, 80));

        expect(observer).toHaveBeenCalled();
        expect(observer.mock.calls[observer.mock.calls.length - 1][0]?.name).toBe('named');
    });

    it('다른 scope로 쓴 변경은 이 scope의 아이템 옵저버를 깨우지 않는다', async () => {
        const counters: Counters = { loadAll: 0, load: 0 };
        const provider = createContextProvider({ cid: 'cloud-a', sid: 's', uid: 'u' });
        const dataSource = new UserLocalDataSourceV2(provider as any, createMemoryStorage(counters));

        const observer = jest.fn();
        dataSource.observeItem('u1', observer, { cid: 'cloud-a' });
        await flushPromises();
        observer.mockClear();

        await dataSource.cacheWrite({ id: 'u1', name: 'other-cloud' } as any, { cid: 'cloud-b' });
        await new Promise(resolve => setTimeout(resolve, 80));

        expect(observer).not.toHaveBeenCalled();
    });
});
