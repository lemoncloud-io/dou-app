import type { CacheStorage } from '../storages';
import { ChatLocalDataSourceV2 } from './ChatLocalDataSourceV2';

// Emulate just enough query behavior to validate pagination and channel scoping.
const createMemoryStorage = (): CacheStorage<'chat'> => {
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
        async loadAll(options?: any) {
            let items = Array.from(map.values()).map(item => ({ ...item }));
            if (options?.channelId) {
                items = items.filter(item => item.channelId === options.channelId);
            }
            items.sort((a, b) => (a.chatNo ?? 0) - (b.chatNo ?? 0));
            if (options?.cursorNo) {
                items = items.filter(item => (item.chatNo ?? 0) < options.cursorNo);
            }
            if (options?.limit) {
                items = items.slice(-options.limit);
            }
            return items;
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
        async clearByChannelId(channelId: string) {
            Array.from(map.entries()).forEach(([id, item]) => {
                if (item.channelId === channelId) map.delete(id);
            });
        },
    };
};

describe('ChatLocalDataSourceV2', () => {
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
        const storage = createMemoryStorage();
        const dataSource = new ChatLocalDataSourceV2(contextProvider as any, storage);

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

    it('throws when chat list input is missing channelId instead of returning an empty fallback', async () => {
        const storage = createMemoryStorage();
        const dataSource = new ChatLocalDataSourceV2(contextProvider as any, storage);

        await expect(dataSource.cacheReadList({ limit: 50 } as any)).rejects.toThrow(
            '[LocalDataSourceV2] channelId is required.'
        );
    });

    describe('cacheReadLastList (ADR-0057)', () => {
        it('uses the storage fast path and preserves the requested channel order', async () => {
            const storage = createMemoryStorage();
            storage.loadLastPerChannel = jest.fn(async () => [
                // 응답 순서는 요청 순서와 다를 수 있다 — 계약 그대로 뒤집어 준다.
                { channelId: 'ch-2', lastNo: 7, item: { id: 'm7', channelId: 'ch-2', chatNo: 7 } as any },
                { channelId: 'ch-1', lastNo: 3, item: { id: 'm3', channelId: 'ch-1', chatNo: 3 } as any },
            ]);
            const dataSource = new ChatLocalDataSourceV2(contextProvider as any, storage);

            const result = await dataSource.cacheReadLastList(['ch-1', 'ch-2']);

            expect(storage.loadLastPerChannel).toHaveBeenCalledWith(['ch-1', 'ch-2']);
            expect(result.map(row => row.channelId)).toEqual(['ch-1', 'ch-2']);
            expect(result.map(row => row.lastNo)).toEqual([3, 7]);
            expect(result.map(row => row.chat?.id)).toEqual(['m3', 'm7']);
        });

        it('falls back to the window scan when the storage cannot answer (old app / plain browser)', async () => {
            const storage = createMemoryStorage();
            storage.loadLastPerChannel = jest.fn(async () => null);
            const dataSource = new ChatLocalDataSourceV2(contextProvider as any, storage);

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
            const storage = createMemoryStorage();
            storage.loadLastPerChannel = jest.fn(async () => [
                // 앱(구버전 의미론)이 리액션 이벤트를 프리뷰라고 답한 경우 — 이 채널만 폴백해야 한다.
                {
                    channelId: 'ch-1',
                    lastNo: 5,
                    item: { id: 'bad', channelId: 'ch-1', chatNo: 5, stereo: 'system', subType: 'reaction' } as any,
                },
                { channelId: 'ch-2', lastNo: 9, item: { id: 'ok', channelId: 'ch-2', chatNo: 9 } as any },
            ]);
            const dataSource = new ChatLocalDataSourceV2(contextProvider as any, storage);

            await dataSource.cacheWriteMany([
                { id: 'm4', channelId: 'ch-1', chatNo: 4, content: 'real' } as any,
                { id: 'other', channelId: 'ch-2', chatNo: 1, content: 'must not be read' } as any,
            ]);

            const result = await dataSource.cacheReadLastList(['ch-1', 'ch-2']);

            expect(result.map(row => row.chat?.id)).toEqual(['m4', 'ok']);
            // ch-2는 fast path의 답을 그대로 써야 한다 — 폴백이 lastNo를 캐시 기준으로 덮으면
            // (1 < 9) head-트리거가 이미 가진 행을 부족분으로 오판한다.
            expect(result[1]?.lastNo).toBe(9);
        });

        it('폴백 모드의 재실행은 쓰기가 건드린 채널만 다시 읽는다 (ADR-0059 dirty 축소)', async () => {
            const storage = createMemoryStorage(); // loadLastPerChannel 없음 = 폴백 모드
            const loadAllSpy = jest.spyOn(storage, 'loadAll');
            const dataSource = new ChatLocalDataSourceV2(contextProvider as any, storage);
            await dataSource.cacheWriteMany([
                { id: 'a1', channelId: 'ch-1', chatNo: 1, content: 'a' } as any,
                { id: 'b1', channelId: 'ch-2', chatNo: 1, content: 'b' } as any,
            ]);

            loadAllSpy.mockClear();
            await dataSource.cacheReadLastList(['ch-1', 'ch-2']);
            // 첫 실행은 기준이 없으므로 전 채널을 읽는다.
            expect(loadAllSpy).toHaveBeenCalledTimes(2);

            await dataSource.cacheWrite({ id: 'b2', channelId: 'ch-2', chatNo: 2, content: 'b2' } as any);
            loadAllSpy.mockClear();
            const result = await dataSource.cacheReadLastList(['ch-1', 'ch-2']);

            // 재실행은 dirty(ch-2)만 윈도우를 다시 읽고, ch-1은 메모를 재사용한다 — 쓰기
            // 버스트마다 N채널 전량 재읽기가 원래 폭주의 재연이 되는 것을 막는 핵심.
            expect(loadAllSpy).toHaveBeenCalledTimes(1);
            expect(result.map(row => row.chat?.id)).toEqual(['a1', 'b2']);
        });

        it('cacheClear 뒤의 재실행은 메모를 버리고 전량 재읽기한다', async () => {
            const storage = createMemoryStorage();
            const loadAllSpy = jest.spyOn(storage, 'loadAll');
            const dataSource = new ChatLocalDataSourceV2(contextProvider as any, storage);
            await dataSource.cacheWriteMany([{ id: 'a1', channelId: 'ch-1', chatNo: 1, content: 'a' } as any]);

            await dataSource.cacheReadLastList(['ch-1']);
            await dataSource.cacheClear();
            loadAllSpy.mockClear();

            const result = await dataSource.cacheReadLastList(['ch-1']);

            expect(loadAllSpy).toHaveBeenCalledTimes(1);
            expect(result).toEqual([{ channelId: 'ch-1', lastNo: 0, chat: null }]);
        });

        it('keeps an empty channel as a valid "nothing to preview" answer without falling back', async () => {
            const storage = createMemoryStorage();
            storage.loadLastPerChannel = jest.fn(async () => [{ channelId: 'ch-1', lastNo: 0, item: null }]);
            const fallbackSpy = jest.spyOn(storage, 'loadAll');
            const dataSource = new ChatLocalDataSourceV2(contextProvider as any, storage);

            const result = await dataSource.cacheReadLastList(['ch-1']);

            expect(result).toEqual([{ channelId: 'ch-1', lastNo: 0, chat: null }]);
            expect(fallbackSpy).not.toHaveBeenCalled();
        });
    });

    describe('observeLastList (ADR-0057)', () => {
        it('re-emits the combined observer on any chat write and delivers the fresh preview', async () => {
            const storage = createMemoryStorage();
            const dataSource = new ChatLocalDataSourceV2(contextProvider as any, storage);

            await dataSource.cacheWrite({ id: 'm1', channelId: 'ch-1', chatNo: 1, content: 'old' } as any);
            await new Promise(resolve => setTimeout(resolve, 80)); // flush 타이머(50ms) 통과

            const emissions: Array<Array<{ channelId: string; chat: { id?: string } | null }>> = [];
            const unsubscribe = dataSource.observeLastList(['ch-1', 'ch-2'], rows => emissions.push(rows));
            await new Promise(resolve => setTimeout(resolve, 20)); // 첫 구독 쿼리 정착

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
        const storage = createMemoryStorage();
        const dataSource = new ChatLocalDataSourceV2(contextProvider as any, storage);

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
