import 'fake-indexeddb/auto';
import { ChatQueryExecutor } from './ChatQueryExecutor';
import { IndexedDBDatabase } from './IndexedDBDatabase';
import { IndexedDBAdapter } from './IndexedDBAdapter';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

if (typeof globalThis.structuredClone !== 'function') {
    globalThis.structuredClone = ((value: unknown) => clone(value)) as typeof structuredClone;
}

const scopeOf = (cid: string, uid: string) => ({ getContext: () => ({ cid, uid }), setContext: () => undefined });

const chat = (id: string, chatNo: number, channelId = 'channel-main') =>
    ({ id, cid: 'model-cid', channelId, chatNo, content: `msg-${id}`, createdAt: chatNo, updatedAt: chatNo }) as any;

/** chat_no 1..count — committed messages the server has numbered. */
const committed = (count: number, channelId = 'channel-main') =>
    Array.from({ length: count }, (_, index) => chat(`c-${String(index + 1).padStart(3, '0')}`, index + 1, channelId));

/**
 * chat_no 0 = an unsent row (optimistically sending, or failed). `ChatLocalDataSource` writes
 * this value, and `mappers.ts` demotes any server response without a chatNo down to it.
 */
const unsent = (id: string, createdAt: number, channelId = 'channel-main') => ({
    ...chat(id, 0, channelId),
    createdAt,
});

const hasUnsent = (rows: Array<{ chatNo?: number }>) => rows.some(row => (row.chatNo ?? 0) === 0);
const idsOf = (rows: Array<{ id: string }>) => rows.map(row => row.id);

/**
 * `chat_no: 0` sorts **lowest** in `CHAT_PAGINATION_INDEX`, but a read is `direction: 'prev'` +
 * limit (the newest N). So in a channel with `limit` or more server messages, an unsent row
 * gets pushed out of the page and is never rendered — a failed message gets no "send failed"
 * indicator and no retry button.
 *
 * `includeUnsent` reads those rows a second time from a separate index range (`[..,0] →
 * [..,1)`, upper bound exclusive) and merges them in. **The default is false, and behavior in
 * that case must be exactly the same as before this option existed** — `apps/web` (mobile)
 * goes through the same executor. The first describe below locks in that invariant.
 */
describe('ChatQueryExecutor', () => {
    let db: IndexedDBDatabase;

    beforeEach(() => {
        db = new IndexedDBDatabase();
    });

    const adapterFor = (cid: string) =>
        new IndexedDBAdapter(db, 'chat', scopeOf(cid, 'u1'), { executor: new ChatQueryExecutor() });

    describe('default (includeUnsent 미지정) — 모바일 경로, 동작 불변', () => {
        it('바쁜 채널에서 미전송 행을 떨어뜨린다 (기존 동작 그대로)', async () => {
            const storage = adapterFor('busy-default');
            await storage.saveAll([...committed(60), unsent('pending-1', 9_999)]);

            const page = await storage.loadAll({ channelId: 'channel-main', limit: 50 });

            expect(page).toHaveLength(50);
            expect(hasUnsent(page)).toBe(false);
        });

        it('조용한 채널에서는 미전송 행이 원래도 들어온다 (limit에 안 밀림)', async () => {
            const storage = adapterFor('quiet-default');
            await storage.saveAll([...committed(2), unsent('pending-1', 9_999)]);

            const page = await storage.loadAll({ channelId: 'channel-main', limit: 50 });

            expect(page).toHaveLength(3);
            expect(hasUnsent(page)).toBe(true);
        });
    });

    describe('includeUnsent — 데스크탑 opt-in', () => {
        it('바쁜 채널에서도 미전송 행을 최신 페이지에 함께 준다', async () => {
            const storage = adapterFor('busy-optin');
            await storage.saveAll([...committed(60), unsent('pending-1', 9_999)]);

            const page = await storage.loadAll({ channelId: 'channel-main', limit: 50, includeUnsent: true });

            expect(idsOf(page)).toContain('pending-1');
            // The newest 50 committed messages come back as-is, plus the unsent one added in.
            expect(page).toHaveLength(51);
        });

        it('미전송 행이 여러 개여도 전부 준다', async () => {
            const storage = adapterFor('multi-optin');
            await storage.saveAll([
                ...committed(60),
                unsent('pending-1', 9_998),
                unsent('pending-2', 9_999),
                unsent('pending-3', 10_000),
            ]);

            const page = await storage.loadAll({ channelId: 'channel-main', limit: 50, includeUnsent: true });

            expect(idsOf(page)).toEqual(expect.arrayContaining(['pending-1', 'pending-2', 'pending-3']));
            expect(page).toHaveLength(53);
        });

        it('다른 채널의 미전송 행은 섞이지 않는다', async () => {
            const storage = adapterFor('scope-optin');
            await storage.saveAll([...committed(60), unsent('mine', 9_999), unsent('theirs', 9_999, 'channel-other')]);

            const page = await storage.loadAll({ channelId: 'channel-main', limit: 50, includeUnsent: true });

            expect(idsOf(page)).toContain('mine');
            expect(idsOf(page)).not.toContain('theirs');
        });

        it('cursorNo 페이지에서는 아무것도 더하지 않는다 — 그 범위는 이미 0까지 내려간다', async () => {
            // A cursorNo page's range is [0, cursorNo), so it already includes unsent rows.
            // Reading them again here would make the same message show up twice in the list. The flag must be harmless here.
            const storage = adapterFor('older-optin');
            const seed = [...committed(60), unsent('pending-1', 9_999)];
            await storage.saveAll(seed);

            const query = { channelId: 'channel-main', limit: 50, cursorNo: 11 };
            const withFlag = await storage.loadAll({ ...query, includeUnsent: true });
            const withoutFlag = await storage.loadAll(query);

            expect(idsOf(withFlag)).toEqual(idsOf(withoutFlag));
            expect(idsOf(withFlag).filter(id => id === 'pending-1')).toHaveLength(1);
        });

        it('미전송 행이 없으면 기본 경로와 같은 결과를 준다', async () => {
            const storage = adapterFor('none-optin');
            await storage.saveAll(committed(60));

            const page = await storage.loadAll({ channelId: 'channel-main', limit: 50, includeUnsent: true });

            expect(page).toHaveLength(50);
        });
    });
});
