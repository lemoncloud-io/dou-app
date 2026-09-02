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

/** chat_no 1..count — 서버가 번호를 매긴 커밋된 메시지들. */
const committed = (count: number, channelId = 'channel-main') =>
    Array.from({ length: count }, (_, index) => chat(`c-${String(index + 1).padStart(3, '0')}`, index + 1, channelId));

/**
 * chat_no 0 = 미전송 행(낙관적 전송 중이거나 실패). `ChatLocalDataSourceV2`가 이 값을 쓰고
 * `mappers.ts`가 서버 chatNo 없는 응답을 여기로 강등한다.
 */
const unsent = (id: string, createdAt: number, channelId = 'channel-main') => ({
    ...chat(id, 0, channelId),
    createdAt,
});

const hasUnsent = (rows: Array<{ chatNo?: number }>) => rows.some(row => (row.chatNo ?? 0) === 0);
const idsOf = (rows: Array<{ id: string }>) => rows.map(row => row.id);

/**
 * `chat_no: 0`은 `CHAT_PAGINATION_INDEX`에서 **최하위로 정렬**되는데 읽기는 `direction: 'prev'` +
 * limit(최신 N개)이다. 그래서 서버 메시지가 limit개 이상 쌓인 채널에서는 미전송 행이 페이지 밖으로
 * 밀려나 한 번도 렌더되지 않는다 — 실패 메시지에 "전송 실패"도 재전송 버튼도 안 붙는다.
 *
 * `includeUnsent`는 그 행들을 별도 인덱스 레인지(`[..,0] → [..,1)` 상한 exclusive)로 한 번 더 읽어
 * 합친다. **기본값은 false이고, 그때의 동작은 이 옵션이 없던 때와 완전히 같아야 한다** —
 * `apps/web`(모바일)이 같은 실행기를 지나기 때문이다. 그 불변을 아래 첫 describe가 잠근다.
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
            // 커밋된 최신 50개는 그대로 오고, 미전송분이 더해진다.
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
            // cursorNo 페이지의 범위는 [0, cursorNo)라 미전송 행을 원래도 포함한다.
            // 여기서 한 번 더 읽으면 같은 메시지가 목록에 두 번 뜬다. 플래그는 무해해야 한다.
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
