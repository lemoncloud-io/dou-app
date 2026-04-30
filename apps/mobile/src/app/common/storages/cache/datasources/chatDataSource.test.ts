import Database from 'better-sqlite3';
import { chatDataSource } from './chatDataSource';
import { MIGRATIONS, TARGET_VERSION } from '../../../database';
import { TABLES } from '../../../database';
import { metaDataSource } from './metaDataSource';

const mockDb = new Database(':memory:');

jest.mock('../../../../../database/core/database', () => ({
    database: {
        execute: jest.fn(async (query: string, params: any[] = []) => {
            const stmt = mockDb.prepare(query);
            if (query.trim().toUpperCase().startsWith('SELECT')) {
                return { rows: stmt.all(params) };
            } else {
                const result = stmt.run(params);
                return { rows: [], changes: result.changes };
            }
        }),
        executeBatch: jest.fn(async (commands: any[]) => {
            const batch = mockDb.transaction(cmds => {
                for (const [sql, params] of cmds) {
                    mockDb.prepare(sql).run(params);
                }
            });
            batch(commands);
        }),
    },
}));

describe('ChatDataSource Test', () => {
    beforeAll(() => {
        const migrate = mockDb.transaction(() => {
            for (let v = 0; v < TARGET_VERSION; v++) {
                MIGRATIONS[v]?.forEach((sql: string) => mockDb.exec(sql));
            }
            mockDb.pragma(`user_version = ${TARGET_VERSION}`);
        });
        migrate();
    });

    beforeEach(() => {
        mockDb.exec(`DELETE
                     FROM ${TABLES.CHATS}`);
        jest.clearAllMocks();
    });

    // --- 라우드 격리 및 기본 CRUD ---
    describe('Multi-tenant Isolation & CRUD', () => {
        it('동일 ID 메시지라도 CID가 다르면 독립적으로 저장되고 조회되어야 한다', async () => {
            const msgData = { channelId: 'ch1', chatNo: 1, content: 'Hello' };

            await chatDataSource.save('msg_1', msgData as any, 'cloud_A');
            await chatDataSource.save('msg_1', { ...msgData, content: 'World' } as any, 'cloud_B');

            const resA = await chatDataSource.fetch('msg_1', 'cloud_A');
            const resB = await chatDataSource.fetch('msg_1', 'cloud_B');

            expect(resA?.content).toBe('Hello');
            expect(resB?.content).toBe('World');
            expect(resA?.cid).toBe('cloud_A');
        });

        it('remove 시 해당 cid의 데이터만 정확히 삭제되어야 한다', async () => {
            await chatDataSource.save('target', { content: 'Delete Me' } as any, 'c1');
            await chatDataSource.save('target', { content: 'Keep Me' } as any, 'c2');

            await chatDataSource.remove('target', 'c1');

            expect(await chatDataSource.fetch('target', 'c1')).toBeNull();
            expect(await chatDataSource.fetch('target', 'c2')).not.toBeNull();
        });
    });

    // --- 복합 필터링 및 키워드 검색 ---
    describe('Advanced Search & Filtering', () => {
        it('채널 ID와 키워드 검색이 AND 조건으로 올바르게 결합되어야 한다', async () => {
            const chats = [
                { id: 'm1', data: { channelId: 'room1', content: 'Apple is red' } },
                { id: 'm2', data: { channelId: 'room1', content: 'Banana is yellow' } },
                { id: 'm3', data: { channelId: 'room2', content: 'Apple is green' } },
            ];
            await chatDataSource.saveAll(chats as any, 'cloud1');

            // room1에 있으면서 'Apple'이 포함된 메시지 조회
            const results = await chatDataSource.fetchAll('cloud1', {
                channelId: 'room1',
                keyword: 'Apple',
            } as any);

            expect(results).toHaveLength(1);
            expect(results[0].id).toBe('m1');
        });

        it('특수 문자 및 공백이 포함된 키워드 검색이 정상적이어야 한다', async () => {
            await chatDataSource.save('m1', { content: '오늘 점심 뭐 먹지?' } as any, 'c1');
            await chatDataSource.save('m2', { content: '!!주의사항!!' } as any, 'c1');

            const res1 = await chatDataSource.fetchAll('c1', { keyword: '점심 뭐' } as any);
            const res2 = await chatDataSource.fetchAll('c1', { keyword: '!!' } as any);

            expect(res1).toHaveLength(1);
            expect(res2).toHaveLength(1);
        });
    });

    // --- 정렬 및 대량 데이터 ---
    describe('Sorting & High Volume', () => {
        it('chat_no 기준 오름차순/내림차순 정렬이 정확해야 한다', async () => {
            const data = [
                { id: 'm1', data: { chatNo: 10, content: 'Older' } },
                { id: 'm2', data: { chatNo: 20, content: 'Newer' } },
            ];
            await chatDataSource.saveAll(data as any, 'c1');

            const desc = await chatDataSource.fetchAll('c1', { sort: 'desc' });
            const asc = await chatDataSource.fetchAll('c1', { sort: 'asc' });

            expect(desc[0].chatNo).toBe(20);
            expect(asc[0].chatNo).toBe(10);
        });

        it('1,000개의 메시지를 Batch로 저장해도 데이터 누락이 없어야 한다', async () => {
            const bulk = Array.from({ length: 1000 }, (_, i) => ({
                id: `bulk_${i}`,
                data: { chatNo: i, content: `msg ${i}`, channelId: 'perf' },
            }));

            await chatDataSource.saveAll(bulk as any, 'c_perf');

            const results = await chatDataSource.fetchAll('c_perf', { channelId: 'perf' });
            expect(results).toHaveLength(1000);
            expect(results[0].chatNo).toBe(999);
        });
    });

    // --- 엣지 케이스 방어 ---
    describe('Robustness & Edge Cases', () => {
        it('removeAll에 빈 배열을 넘겼을 때 executeBatch가 호출되지 않아야 한다', async () => {
            const spy = jest.spyOn(require('../../../database').database, 'executeBatch');

            await chatDataSource.removeAll([], 'c1');

            expect(spy).not.toHaveBeenCalled();
            spy.mockRestore();
        });

        it('데이터 저장 시 필수 필드가 누락되어도 기본값이 적용되어야 한다', async () => {
            // chatNo, createdAt 등이 없는 불완전한 데이터
            const brokenItem = { content: 'Partial' };
            await chatDataSource.save('partial_1', brokenItem as any, 'c1');

            const result = await chatDataSource.fetch('partial_1', 'c1');
            expect(result).not.toBeNull();

            // DB 컬럼에 0 또는 기본값이 박혔는지 확인
            const row = mockDb
                .prepare(
                    `SELECT chat_no, created_at
                     FROM ${TABLES.CHATS}
                     WHERE id = 'partial_1'`
                )
                .get() as any;
            expect(row.chat_no).toBe(0);
            expect(row.created_at).toBe(0);
        });
    });

    // --- 복합 메타 데이터 및 JSON 정합성 테스트 ---
    describe('Complex JSON Metadata Integrity', () => {
        it('깊은 깊이(Deeply Nested)를 가진 JSON 객체도 데이터 손실 없이 저장/조회되어야 한다', async () => {
            const complexMeta = {
                syncStatus: 'partial',
                history: [
                    { action: 'create', tags: ['work', 'important'], detail: { author: 'admin' } },
                    { action: 'update', tags: ['personal'], detail: { author: 'user1' } },
                ],
                config: { theme: 'dark', notifications: { email: true, push: false } },
            };

            await metaDataSource.save('system', 'config_v1', 'c1', complexMeta);
            const fetched = await metaDataSource.fetch('system', 'config_v1', 'c1');

            expect(fetched.config.notifications.push).toBe(false);
            expect(fetched.history[0].tags).toContain('important');
            expect(fetched.history[1].detail.author).toBe('user1');
        });
    });
});
