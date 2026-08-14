import type { CacheStorage } from '../storages';
import { JoinLocalDataSourceV2 } from './JoinLocalDataSourceV2';

/**
 * Re-emit fan-out contract.
 *
 * Observer notify re-reads storage (`callback(await query())`), so every observer woken by a write
 * costs one storage round trip — a bridge call on native. With one join observer per channel
 * (`useMyJoins`), waking all of them turns a single write into N round trips: measured in the app,
 * `loadAll:join` was 77% of all cache calls and 84% of all cache time, at 16.5 reads per write.
 *
 * The cause was a prefix, not the fan-out design: prefixes match by `startsWith`, and a bare
 * `${scope}|joins` entry matched every join observer key. These tests pin both directions — narrow
 * enough to skip other channels, still wide enough to catch every query variant of the written one.
 */
const flushPromises = async () => {
    await Promise.resolve();
    await Promise.resolve();
};

let loadAllCalls = 0;

const createMemoryStorage = (): CacheStorage<'join'> => {
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
        async loadMany(ids) {
            // 계약대로 없는 id는 빼고, 순서도 보장하지 않습니다(뒤집어 돌려줍니다) — 위치로 짝을
            // 맞추는 코드가 여기서 반드시 깨지도록 두는 것이 이 fixture의 역할입니다.
            return ids
                .filter(id => map.has(id))
                .map(id => ({ ...map.get(id) }))
                .reverse();
        },
        async loadAll(options?: any) {
            loadAllCalls += 1;
            const list = Array.from(map.values()).map(item => ({ ...item }));
            if (!options?.channelId) return list;
            return list.filter(item => item.channelId === options.channelId);
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
            // not used here
        },
    } as unknown as CacheStorage<'join'>;
};

const createSource = () => {
    const storage = createMemoryStorage();
    const contextProvider = {
        getContext: () => ({ cid: 'cloud-a', uid: 'me', sid: 'site-1' }),
        setContext: () => undefined,
    };
    return new JoinLocalDataSourceV2(contextProvider as any, storage);
};

describe('JoinLocalDataSourceV2 재발행 범위', () => {
    beforeEach(() => {
        jest.useFakeTimers();
    });
    afterEach(() => {
        jest.useRealTimers();
    });

    const settle = async () => {
        jest.runOnlyPendingTimers();
        await flushPromises();
    };

    it('한 채널에 쓰면 다른 채널의 옵저버는 깨우지 않는다', async () => {
        const source = createSource();
        const a = jest.fn();
        const b = jest.fn();

        source.observeList({ channelId: 'ch-a' }, a);
        source.observeList({ channelId: 'ch-b' }, b);
        await settle();
        a.mockClear();
        b.mockClear();

        await source.cacheWrite({ id: 'ch-a@me', channelId: 'ch-a', userId: 'me', readNo: 1 } as any);
        await settle();

        expect(a).toHaveBeenCalled();
        expect(b).not.toHaveBeenCalled();
    });

    // prefix에 구분자가 없으면 `channel:ch-1`이 `channel:ch-10`까지 잡는다 — 접두사가 겹치는 id는
    // 흔하므로(ch-1 / ch-10) 세그먼트 경계까지 확인한다.
    it('id 접두사가 겹치는 다른 채널은 깨우지 않는다', async () => {
        const source = createSource();
        const one = jest.fn();
        const ten = jest.fn();

        source.observeList({ channelId: 'ch-1' }, one);
        source.observeList({ channelId: 'ch-10' }, ten);
        await settle();
        one.mockClear();
        ten.mockClear();

        await source.cacheWrite({ id: 'ch-1@me', channelId: 'ch-1', userId: 'me', readNo: 1 } as any);
        await settle();

        expect(one).toHaveBeenCalled();
        expect(ten).not.toHaveBeenCalled();
    });

    // 좁히다가 반대로 놓치면 안 된다: 같은 채널의 질의 변형(activeOnly)은 키가 다르지만 전부 깨어나야 한다.
    // 같은 키를 보는 소비자가 셋(UnifiedLayout · UnreadBadgeRunner · HomePage의 useMyJoins)이라
    // 예전에는 쓰기 1회가 동일한 읽기 3회를 만들었다. 직렬 브릿지에서는 마지막 옵저버가 3배를 기다린다.
    it('같은 키의 옵저버가 여럿이어도 저장소는 한 번만 읽는다', async () => {
        const source = createSource();
        const a = jest.fn();
        const b = jest.fn();
        const c = jest.fn();

        source.observeList({ channelId: 'ch-a' }, a);
        source.observeList({ channelId: 'ch-a' }, b);
        source.observeList({ channelId: 'ch-a' }, c);
        await settle();

        loadAllCalls = 0;
        await source.cacheWrite({ id: 'ch-a@me', channelId: 'ch-a', userId: 'me', readNo: 7 } as any);
        await settle();

        // 셋 다 값을 받되, 저장소 조회는 한 번(쓰기 경로의 기존 조회는 loadAllCalls 리셋 이후로만 센다).
        expect(a).toHaveBeenCalled();
        expect(b).toHaveBeenCalled();
        expect(c).toHaveBeenCalled();
        expect(loadAllCalls).toBe(1);
    });

    it('같은 채널의 질의 변형은 모두 깨운다', async () => {
        const source = createSource();
        const plain = jest.fn();
        const activeOnly = jest.fn();

        source.observeList({ channelId: 'ch-a' }, plain);
        source.observeList({ channelId: 'ch-a', activeOnly: true }, activeOnly);
        await settle();
        plain.mockClear();
        activeOnly.mockClear();

        await source.cacheWrite({ id: 'ch-a@me', channelId: 'ch-a', userId: 'me', readNo: 2 } as any);
        await settle();

        expect(plain).toHaveBeenCalled();
        expect(activeOnly).toHaveBeenCalled();
    });
});
