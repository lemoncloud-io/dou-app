import Database from 'better-sqlite3';
import { cacheCrudService } from './cacheCrudService';
import { MIGRATIONS, TARGET_VERSION, TABLES } from './sqlite';

const mockDb = new Database(':memory:');

jest.mock('react-native', () => ({}), { virtual: true });
jest.mock('./sqlite/core/database', () => ({
    database: {
        execute: jest.fn(async (query, params = []) => {
            const stmt = mockDb.prepare(query);
            return query.trim().toUpperCase().startsWith('SELECT')
                ? { rows: stmt.all(params) }
                : { rows: [], changes: stmt.run(params).changes };
        }),
        executeBatch: jest.fn(async commands => {
            mockDb.transaction(cmds => {
                for (const [sql, params] of cmds) mockDb.prepare(sql).run(params);
            })(commands);
        }),
    },
}));

describe('cacheCrudService Professional Test (Paging & Snapshots)', () => {
    mockDb.transaction(() => {
        for (let v = 0; v < TARGET_VERSION; v++) {
            MIGRATIONS[v]?.forEach((sql: string) => mockDb.exec(sql));
        }
        mockDb.pragma(`user_version = ${TARGET_VERSION}`);
    })();
});

beforeEach(() => {
    [TABLES.CHATS, TABLES.METAS].forEach(table =>
        mockDb.exec(`DELETE
                     FROM ${table}`)
    );
    jest.clearAllMocks();
});

// ---  이징 스냅샷 무결성 테스트  ---
describe('Paging Snapshot Integrity', () => {
    it('saveAll 시 페이징 쿼리가 있다면 ID 리스트 스냅샷을 저장해야 한다', async () => {
        const cid = 'cloud_1';
        const query = { limit: 20, page: 1 }; // 페이징 유발 쿼리
        const items = [
            { id: 'msg_1', content: 'Hello' },
            { id: 'msg_2', content: 'World' },
        ];

        // 저장 실행
        await cacheCrudService.saveAll({ type: 'chat', items: items as any, cid, query });

        // 메타 데이터베이스에 스냅샷이 생성되었는지 직접 확인
        const metaKey = JSON.stringify(query);
        const metaRow = mockDb
            .prepare(
                `SELECT data
                 FROM ${TABLES.METAS}
                 WHERE key = ?`
            )
            .get(metaKey) as any;

        expect(metaRow).toBeDefined();
        const savedMeta = JSON.parse(metaRow.data);
        expect(savedMeta.ids).toEqual(['msg_1', 'msg_2']);
    });

    it('fetchAll: 데이터가 추가되어도 기존 스냅샷이 있다면 스냅샷의 ID들만 반환해야 한다', async () => {
        const cid = 'cloud_1';
        const query = { limit: 10, page: 1 };

        // 초기 데이터(스냅샷) 저장
        const originalItems = [{ id: 'old_1' }, { id: 'old_2' }];
        await cacheCrudService.saveAll({ type: 'chat', items: originalItems as any, cid, query });

        // DB에 스냅샷에 없는 "새로운" 데이터 추가 (실시간 수신 상황 시뮬레이션)
        await cacheCrudService.save({
            type: 'chat',
            id: 'new_3',
            item: { content: 'New Message' } as any,
            cid,
        });

        // fetchAll 호출 (동일 쿼리)
        const results = await cacheCrudService.fetchAll({ type: 'chat', query, cid });

        // 검증: 새로 추가된 'new_3'는 결과에 없어야 함 (스냅샷 유지)
        expect(results).toHaveLength(2);
        expect(results.map(r => r.id)).toEqual(['old_1', 'old_2']);
        expect(results.find(r => r.id === 'new_3')).toBeUndefined();
    });

    it('페이징 파라미터가 없는 쿼리는 스냅샷을 생성하지 않고 최신 DB를 쿼리해야 한다', async () => {
        const cid = 'cloud_1';
        const query = { channelId: 'room_1' }; // limit/page 없음

        await cacheCrudService.saveAll({
            type: 'chat',
            items: [{ id: 'm1' }] as any,
            cid,
            query,
        });

        // 메타 테이블 확인
        const metaKey = JSON.stringify(query);
        const metaRow = mockDb
            .prepare(
                `SELECT data
                 FROM ${TABLES.METAS}
                 WHERE key = ?`
            )
            .get(metaKey);
        expect(metaRow).toBeUndefined(); // 스냅샷 생성 안됨
    });
});

// --- 기본 CRUD 연동 테스트 ---
describe('Generic CRUD Coordination', () => {
    it('clear 호출 시 특정 도메인의 테이블 데이터만 완전히 삭제해야 한다', async () => {
        await cacheCrudService.save({ type: 'chat', id: 'c1', item: {} as any, cid: 'cloud' });

        await cacheCrudService.clear({ type: 'chat' }); //

        const result = await cacheCrudService.fetch({ type: 'chat', id: 'c1', cid: 'cloud' });
        expect(result).toBeNull();
    });

    it('save/fetch: 저장된 데이터는 파싱 후 정확한 타입으로 반환되어야 한다', async () => {
        const chatItem = { id: 'chat_99', content: 'Complex Chat', chatNo: 99 };
        await cacheCrudService.save({
            type: 'chat',
            id: 'chat_99',
            item: chatItem as any,
            cid: 'cloud_1',
        });

        const fetched = await cacheCrudService.fetch({ type: 'chat', id: 'chat_99', cid: 'cloud_1' });
        expect(fetched?.content).toBe('Complex Chat');
        expect(fetched?.id).toBe('chat_99'); // 패치 로직 동작 확인
    });
});
