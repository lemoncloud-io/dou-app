import 'fake-indexeddb/auto';
import type { IIndexedDB } from '@chatic/data';
import { logger } from '@chatic/bridges';
import { ChatQueryExecutor } from './ChatQueryExecutor';
import { IndexedDBDatabase } from './IndexedDBDatabase';
import { IndexedDBAdapter } from './IndexedDBAdapter';

jest.mock('@chatic/bridges', () => ({
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

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

/** cid/uid must differ per test — IndexedDBDatabase instances share the same DB. */
const scopeOf = (cid: string, uid: string) => ({ getContext: () => ({ cid, uid }), setContext: () => undefined });

/** Committed messages with chat_no 1..count (0 is the value for an uncommitted row) */
const committedChats = (count: number, channelId = 'channel-main', idPrefix = 'c') =>
    Array.from({ length: count }, (_, index) =>
        chat(`${idPrefix}-${String(index + 1).padStart(2, '0')}`, { channelId, chatNo: index + 1 })
    );

const idsOf = (items: Array<{ id: string }>) => items.map(item => item.id).sort();

/** An IIndexedDB stub for inspecting call counts/arguments. Overrides only the specified methods. */
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
        clearByRange: jest.fn().mockResolvedValue(0),
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

        // A channel at its cap is a hot path every message passes through — reading values for
        // the over-cap check (the old version: deserializing limit+1 rows) makes the cap most
        // expensive at exactly the point where it should be helping most.
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

        // The boundary must be an absolute key. Deriving it from a count would let a concurrent
        // removal between the two lookups push the boundary upward and delete messages that
        // are still visible.
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

/**
 * With no session in scope (uid absent), no cache operation should ever touch storage.
 *
 * Previously, an empty uid was filled in as `'default'`, reading and writing to a phantom
 * partition, `chat:default:default:*`. Rows and sync cursors written in that window between
 * relay logout and login were never read again after login, freezing the channel list empty
 * while `channel.sync` kept fetching only deltas.
 */
describe('IndexedDBAdapter — 세션이 없으면 건너뛴다', () => {
    const noSession = { getContext: () => ({ cid: 'cloud-a' }), setContext: () => undefined } as never;

    it('쓰기는 저장소에 닿지 않고 입력을 그대로 돌려준다', async () => {
        const stub = createStubDb();
        const adapter = new IndexedDBAdapter(stub, 'chat', noSession);

        await expect(adapter.save('c-1', chat('c-1'))).resolves.toEqual(chat('c-1'));
        await expect(adapter.saveAll([chat('c-1')])).resolves.toEqual([chat('c-1')]);

        expect(stub.save).not.toHaveBeenCalled();
        expect(stub.saveAll).not.toHaveBeenCalled();
    });

    it('읽기는 저장소에 닿지 않고 빈 값을 돌려준다', async () => {
        const stub = createStubDb();
        const adapter = new IndexedDBAdapter(stub, 'chat', noSession);

        await expect(adapter.load('c-1')).resolves.toBeNull();
        await expect(adapter.loadAll()).resolves.toEqual([]);
        await expect(adapter.loadMany(['c-1', 'c-2'])).resolves.toEqual([]);

        expect(stub.load).not.toHaveBeenCalled();
        expect(stub.loadAll).not.toHaveBeenCalled();
    });

    // Delete is the riskiest case — deleting a phantom partition is harmless, but picking the
    // wrong scope deletes someone else's partition. The correct answer with no session is to do nothing at all.
    it('삭제는 아무것도 지우지 않는다', async () => {
        const stub = createStubDb();
        const adapter = new IndexedDBAdapter(stub, 'chat', noSession);

        await adapter.delete('c-1');
        await adapter.deleteAll(['c-1']);
        await adapter.clearAll();
        await adapter.clearByChannelId('channel-main');

        expect(stub.delete).not.toHaveBeenCalled();
        expect(stub.deleteAll).not.toHaveBeenCalled();
        expect(stub.clearAll).not.toHaveBeenCalled();
        expect(stub.clearByRange).not.toHaveBeenCalled();
    });

    it('세션이 붙으면 같은 어댑터가 정상 동작한다', async () => {
        const session: { uid?: string } = {};
        const provider = {
            getContext: () => ({ cid: 'cloud-a', uid: session.uid }),
            setContext: () => undefined,
        } as never;
        const stub = createStubDb();
        const adapter = new IndexedDBAdapter(stub, 'chat', provider);

        await adapter.save('c-1', chat('c-1'));
        expect(stub.save).not.toHaveBeenCalled();

        session.uid = 'me';
        await adapter.save('c-1', chat('c-1'));
        expect(stub.save).toHaveBeenCalledWith(expect.objectContaining({ key: 'chat:cloud-a:me:c-1' }));
    });
});

describe('IndexedDBAdapter — 버린 것을 기록한다 (ADR-0099)', () => {
    const warn = logger.warn as jest.Mock;
    const error = logger.error as jest.Mock;
    const info = logger.info as jest.Mock;
    const quota = () => new DOMException('quota', 'QuotaExceededError');

    beforeEach(() => jest.clearAllMocks());

    // When eviction succeeds the user notices nothing, but old messages are gone — the retry result is half the information.
    it('쿼터 초과를 축출로 복구하면 재시도 결과까지 한 줄로 남긴다', async () => {
        const save = jest.fn().mockRejectedValueOnce(quota()).mockResolvedValueOnce(undefined);
        const storage = new IndexedDBAdapter(
            createStubDb({ save, findNewestKeyBeyond: jest.fn().mockResolvedValue(null) }),
            'chat',
            scopeOf('quota-ok', 'u1'),
            { maxChatsPerChannel: 5 }
        );

        await storage.save('c-01', chat('c-01', { chatNo: 1 }));

        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toBe('CACHE');
        expect(warn.mock.calls[0][1]).toContain('retry ok');
        expect(error).not.toHaveBeenCalled();
    });

    it('축출 후 재시도도 실패하면 error로 올리고 다시 던진다', async () => {
        const save = jest.fn().mockRejectedValue(quota());
        const storage = new IndexedDBAdapter(
            createStubDb({ save, findNewestKeyBeyond: jest.fn().mockResolvedValue(null) }),
            'chat',
            scopeOf('quota-fail', 'u1'),
            { maxChatsPerChannel: 5 }
        );

        await expect(storage.save('c-01', chat('c-01', { chatNo: 1 }))).rejects.toThrow();
        expect(error.mock.calls[0][1]).toContain('retry after eviction failed');
    });

    // A client with no cap has no safety net at all — the write is simply lost.
    it('비울 대상이 없으면 error로 남기고 던진다', async () => {
        const save = jest.fn().mockRejectedValue(quota());
        const storage = new IndexedDBAdapter(createStubDb({ save }), 'user', scopeOf('quota-none', 'u1'));

        await expect(storage.save('u-01', { id: 'u-01' } as any)).rejects.toThrow();
        expect(error.mock.calls[0][1]).toContain('nothing to evict');
        expect(warn).not.toHaveBeenCalled();
    });

    it('상한 축출이 실제로 지웠을 때 채널과 건수를 남긴다', async () => {
        const clearByRange = jest.fn().mockResolvedValue(4);
        const storage = new IndexedDBAdapter(
            createStubDb({ clearByRange, findNewestKeyBeyond: jest.fn().mockResolvedValue(['k']) }),
            'chat',
            scopeOf('evict-count', 'u1'),
            { maxChatsPerChannel: 5 }
        );

        await storage.save('c-06', chat('c-06', { chatNo: 6 }));

        expect(info).toHaveBeenCalledTimes(1);
        expect(info.mock.calls[0][2]).toMatchObject({ data: { channelId: 'channel-main', removed: 4, limit: 5 } });
    });

    it('지운 것이 없으면 축출 로그를 남기지 않는다', async () => {
        const storage = new IndexedDBAdapter(
            createStubDb({
                clearByRange: jest.fn().mockResolvedValue(0),
                findNewestKeyBeyond: jest.fn().mockResolvedValue(['k']),
            }),
            'chat',
            scopeOf('evict-zero', 'u1'),
            { maxChatsPerChannel: 5 }
        );

        await storage.save('c-06', chat('c-06', { chatNo: 6 }));

        expect(info).not.toHaveBeenCalled();
    });

    // The caller is told the whole batch was saved, and one of them is simply not there.
    it('id 없는 항목이 saveAll에서 탈락하면 건수를 남긴다', async () => {
        const storage = new IndexedDBAdapter(createStubDb(), 'chat', scopeOf('drop-id', 'u1'));

        await storage.saveAll([chat('c-01'), { ...chat('c-02'), id: undefined }] as any);

        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][2]).toMatchObject({ data: { dropped: 1, total: 2, type: 'chat' } });
    });

    it('전부 id가 있으면 탈락 로그를 남기지 않는다', async () => {
        const storage = new IndexedDBAdapter(createStubDb(), 'chat', scopeOf('drop-none', 'u1'));

        await storage.saveAll([chat('c-01'), chat('c-02')]);

        expect(warn).not.toHaveBeenCalled();
    });
});
