import 'fake-indexeddb/auto';
import type { IIndexedDB } from '@chatic/data';
import { ChatQueryExecutor } from './ChatQueryExecutor';
import { IndexedDBDatabase } from './IndexedDBDatabase';
import { IndexedDBAdapter } from './IndexedDBAdapter';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

if (typeof globalThis.structuredClone !== 'function') {
    globalThis.structuredClone = ((value: unknown) => clone(value)) as typeof structuredClone;
}

const chat = (id: string, overrides: Record<string, unknown> = {}) =>
    ({
        id,
        cid: 'model-cid',
        channelId: 'channel-main',
        text: `chat-${id}`,
        createdAt: 1,
        updatedAt: 1,
        ...overrides,
    }) as any;

/** cid/uid는 테스트마다 달라야 한다 — IndexedDBDatabase 인스턴스는 같은 DB를 공유한다. */
const scopeOf = (cid: string, uid: string) => ({ getContext: () => ({ cid, uid }), setContext: () => undefined });

/** chat_no가 1..count인 커밋된 메시지들 (0은 미커밋 행의 값이다) */
const committedChats = (count: number, channelId = 'channel-main', idPrefix = 'c') =>
    Array.from({ length: count }, (_, index) =>
        chat(`${idPrefix}-${String(index + 1).padStart(2, '0')}`, { channelId, chatNo: index + 1 })
    );

const idsOf = (items: Array<{ id: string }>) => items.map(item => item.id).sort();

/** 호출 횟수·인자를 검사하기 위한 IIndexedDB 스텁. 지정한 메서드만 덮어씁니다. */
const createStubDb = (overrides: Partial<Record<keyof IIndexedDB, jest.Mock>> = {}): IIndexedDB =>
    ({
        save: jest.fn().mockResolvedValue(undefined),
        saveAll: jest.fn().mockResolvedValue(undefined),
        load: jest.fn().mockResolvedValue(undefined),
        loadAll: jest.fn().mockResolvedValue([]),
        loadWithCursor: jest.fn().mockResolvedValue([]),
        delete: jest.fn().mockResolvedValue(undefined),
        deleteAll: jest.fn().mockResolvedValue(undefined),
        clearAll: jest.fn().mockResolvedValue(undefined),
        clearByRange: jest.fn().mockResolvedValue(undefined),
        findNewestKeyBeyond: jest.fn().mockResolvedValue(null),
        ...overrides,
    }) as unknown as IIndexedDB;

describe('IndexedDBAdapter', () => {
    let db: IndexedDBDatabase;

    beforeEach(() => {
        db = new IndexedDBDatabase();
    });

    it('isolates records by cid+uid scope', async () => {
        const contextA = { getContext: () => ({ cid: 'cloud-a', uid: 'user-a' }), setContext: () => undefined };
        const contextB = { getContext: () => ({ cid: 'cloud-a', uid: 'user-b' }), setContext: () => undefined };

        const storageA = new IndexedDBAdapter(db, 'chat', contextA);
        const storageB = new IndexedDBAdapter(db, 'chat', contextB);

        await storageA.save('A1', chat('A1', { text: 'from-a' }));
        await storageB.save('B1', chat('B1', { text: 'from-b' }));

        expect(await storageA.loadAll()).toMatchObject([chat('A1', { text: 'from-a' })]);
        expect(await storageB.loadAll()).toMatchObject([chat('B1', { text: 'from-b' })]);
    });

    it('reads latest cid/uid from contextProvider at call-time', async () => {
        const context = { cid: 'cloud-a', uid: 'user-a' };
        const contextProvider = {
            getContext: () => ({ cid: context.cid, uid: context.uid }),
            setContext: (next: { cid: string; uid: string }) => {
                context.cid = next.cid;
                context.uid = next.uid;
            },
        };

        const storage = new IndexedDBAdapter(db, 'chat', contextProvider);
        await storage.save('A1', chat('A1', { text: 'from-a' }));

        contextProvider.setContext({ cid: 'cloud-b', uid: 'user-b' });
        await storage.save('B1', chat('B1', { text: 'from-b' }));

        expect(await storage.loadAll()).toMatchObject([chat('B1', { text: 'from-b' })]);

        contextProvider.setContext({ cid: 'cloud-a', uid: 'user-a' });
        expect(await storage.loadAll()).toMatchObject([chat('A1', { text: 'from-a' })]);
    });

    it('clearAll affects only current cid+uid scope', async () => {
        const scopeMain = { getContext: () => ({ cid: 'main', uid: 'u1' }), setContext: () => undefined };
        const scopeOther = { getContext: () => ({ cid: 'main', uid: 'u2' }), setContext: () => undefined };

        const main = new IndexedDBAdapter(db, 'chat', scopeMain);
        const other = new IndexedDBAdapter(db, 'chat', scopeOther);

        await main.saveAll([chat('M1'), chat('M2')] as any);
        await other.save('O1', chat('O1'));

        await main.clearAll();
        expect(await main.loadAll()).toEqual([]);
        expect(await other.loadAll()).toMatchObject([chat('O1')]);
    });

    describe('maxChatsPerChannel', () => {
        it('keeps every message when no cap is configured (default = unbounded)', async () => {
            const storage = new IndexedDBAdapter(db, 'chat', scopeOf('cap-none', 'u1'));

            await storage.saveAll(committedChats(12));

            expect(await storage.loadAll()).toHaveLength(12);
        });

        it('evicts the oldest messages once the cap is exceeded', async () => {
            const storage = new IndexedDBAdapter(db, 'chat', scopeOf('cap-save', 'u1'), { maxChatsPerChannel: 5 });

            for (const item of committedChats(8)) {
                await storage.save(item.id, item);
            }

            expect(idsOf(await storage.loadAll())).toEqual(['c-04', 'c-05', 'c-06', 'c-07', 'c-08']);
        });

        it('enforces the cap on the batch write path', async () => {
            const storage = new IndexedDBAdapter(db, 'chat', scopeOf('cap-batch', 'u1'), { maxChatsPerChannel: 5 });

            await storage.saveAll(committedChats(8));

            expect(idsOf(await storage.loadAll())).toEqual(['c-04', 'c-05', 'c-06', 'c-07', 'c-08']);
        });

        it('caps each channel independently', async () => {
            const storage = new IndexedDBAdapter(db, 'chat', scopeOf('cap-multi', 'u1'), { maxChatsPerChannel: 2 });

            await storage.saveAll([...committedChats(4, 'channel-a', 'a'), ...committedChats(4, 'channel-b', 'b')]);

            expect(idsOf(await storage.loadAll())).toEqual(['a-03', 'a-04', 'b-03', 'b-04']);
        });

        it('never evicts uncommitted rows (chat_no 0)', async () => {
            const storage = new IndexedDBAdapter(db, 'chat', scopeOf('cap-pending', 'u1'), { maxChatsPerChannel: 3 });

            await storage.save('pending-1', chat('pending-1', { chatNo: 0, isPending: true }));
            await storage.saveAll(committedChats(6));

            expect(await storage.load('pending-1')).toMatchObject({ id: 'pending-1', isPending: true });
            expect(idsOf(await storage.loadAll())).toEqual(['c-04', 'c-05', 'c-06', 'pending-1']);
        });

        it('leaves ChatQueryExecutor pagination coherent after eviction', async () => {
            const storage = new IndexedDBAdapter(db, 'chat', scopeOf('cap-paging', 'u1'), {
                executor: new ChatQueryExecutor(),
                maxChatsPerChannel: 5,
            });

            await storage.saveAll(committedChats(8));

            const newest = await storage.loadAll({ channelId: 'channel-main', limit: 3 });
            expect(newest.map(item => item.chatNo)).toEqual([8, 7, 6]);

            const olderPage = await storage.loadAll({ channelId: 'channel-main', cursorNo: 6, limit: 3 });
            expect(olderPage.map(item => item.chatNo)).toEqual([5, 4]);

            const evictedPage = await storage.loadAll({ channelId: 'channel-main', cursorNo: 4, limit: 3 });
            expect(evictedPage).toEqual([]);
        });

        // 상한에 도달한 채널은 매 메시지가 지나는 hot path다 — 초과 판정에 값을 읽으면
        // (구버전: limit+1건 역직렬화) 상한이 가장 도움 돼야 할 지점에서 가장 비싸진다.
        it('probes the boundary with a key cursor, never reading row values', async () => {
            const findNewestKeyBeyond = jest.fn().mockResolvedValue(null);
            const loadWithCursor = jest.fn().mockResolvedValue([]);
            const clearByRange = jest.fn().mockResolvedValue(undefined);
            const storage = new IndexedDBAdapter(
                createStubDb({ findNewestKeyBeyond, loadWithCursor, clearByRange }),
                'chat',
                scopeOf('probe-under', 'u1'),
                { maxChatsPerChannel: 5 }
            );

            await storage.save('c-05', chat('c-05', { chatNo: 5 }));

            expect(findNewestKeyBeyond).toHaveBeenCalledTimes(1);
            expect(findNewestKeyBeyond).toHaveBeenCalledWith(expect.anything(), expect.anything(), 5);
            expect(loadWithCursor).not.toHaveBeenCalled();
            expect(clearByRange).not.toHaveBeenCalled();
        });

        // 경계는 절대 키여야 한다. 개수에서 파생하면 두 조회 사이의 동시 제거로 경계가 위로 밀려
        // 아직 보이는 메시지를 지운다.
        it('deletes up to the probed boundary key itself, not a count-derived position', async () => {
            const boundaryKey = ['chat', 'probe-over', 'u1', 'channel-main', 42];
            const findNewestKeyBeyond = jest.fn().mockResolvedValue(boundaryKey);
            const loadWithCursor = jest.fn().mockResolvedValue([]);
            const clearByRange = jest.fn().mockResolvedValue(undefined);
            const storage = new IndexedDBAdapter(
                createStubDb({ findNewestKeyBeyond, loadWithCursor, clearByRange }),
                'chat',
                scopeOf('probe-over', 'u1'),
                { maxChatsPerChannel: 5 }
            );

            await storage.save('c-06', chat('c-06', { chatNo: 6 }));

            expect(loadWithCursor).not.toHaveBeenCalled();
            expect(clearByRange).toHaveBeenCalledTimes(1);
            const [, range] = clearByRange.mock.calls[0];
            expect(range.upper).toEqual(boundaryKey);
            expect(range.lower).toEqual(['chat', 'probe-over', 'u1', 'channel-main', 1]);
        });
    });

    describe('QuotaExceededError', () => {
        const quotaError = () => new DOMException('quota', 'QuotaExceededError');

        it('retries the write once after evicting when a cap is configured', async () => {
            const save = jest.fn().mockRejectedValueOnce(quotaError()).mockResolvedValue(undefined);
            const storage = new IndexedDBAdapter(createStubDb({ save }), 'chat', scopeOf('quota-cap', 'u1'), {
                maxChatsPerChannel: 5,
            });

            await expect(storage.save('c-01', chat('c-01', { chatNo: 1 }))).resolves.toBeDefined();
            expect(save).toHaveBeenCalledTimes(2);
        });

        it('rethrows without retrying when no cap is configured (default path)', async () => {
            const save = jest.fn().mockRejectedValue(quotaError());
            const storage = new IndexedDBAdapter(createStubDb({ save }), 'chat', scopeOf('quota-none', 'u1'));

            await expect(storage.save('c-01', chat('c-01', { chatNo: 1 }))).rejects.toThrow('quota');
            expect(save).toHaveBeenCalledTimes(1);
        });

        it('rethrows without retrying when the row has no channelId to evict from', async () => {
            const save = jest.fn().mockRejectedValue(quotaError());
            const storage = new IndexedDBAdapter(createStubDb({ save }), 'chat', scopeOf('quota-nochannel', 'u1'), {
                maxChatsPerChannel: 5,
            });

            await expect(storage.save('c-01', chat('c-01', { chatNo: 1, channelId: undefined }))).rejects.toThrow(
                'quota'
            );
            expect(save).toHaveBeenCalledTimes(1);
        });

        it('rethrows when the retried write fails again', async () => {
            const save = jest.fn().mockRejectedValue(quotaError());
            const storage = new IndexedDBAdapter(createStubDb({ save }), 'chat', scopeOf('quota-retry', 'u1'), {
                maxChatsPerChannel: 5,
            });

            await expect(storage.save('c-01', chat('c-01', { chatNo: 1 }))).rejects.toThrow('quota');
            expect(save).toHaveBeenCalledTimes(2);
        });
    });
});
