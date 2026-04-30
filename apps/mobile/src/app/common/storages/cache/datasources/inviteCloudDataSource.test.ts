import Database from 'better-sqlite3';
import { inviteCloudDataSource } from './inviteCloudDataSource';
import { MIGRATIONS, TARGET_VERSION } from '../../../database';
import { TABLES } from '../../../database';

const mockDb = new Database(':memory:');

jest.mock('../../../database', () => ({
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

describe('InviteCloudDataSource Professional Test', () => {
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
                     FROM ${TABLES.INVITE_CLOUDS}`);
        jest.clearAllMocks();
    });

    it('Global Access: cid가 달라도 동일한 id라면 데이터를 공유해야 한다', async () => {
        const data = { name: 'Global Cloud' };

        await inviteCloudDataSource.save('cloud_1', data as any, 'cid_A');

        const result = await inviteCloudDataSource.fetch('cloud_1', 'cid_B');
        expect(result).not.toBeNull();
        expect(result?.id).toBe('cloud_1');
    });

    it('Patch Integrity: 저장 시 객체 내부에 id가 정확히 주입되어야 한다', async () => {
        const rawItem = { backend: 'https://api.test.com' };
        await inviteCloudDataSource.save('invite_id', rawItem as any, 'any');

        const fetched = await inviteCloudDataSource.fetch('invite_id', 'any');
        expect(fetched?.id).toBe('invite_id');
    });

    // it('fetchAll: 저장된 모든 전역 클라우드 정보를 조회해야 한다', async () => {
    //     const items = [
    //         { id: 'cloud_1', data: { name: 'Alpha' } },
    //         { id: 'cloud_2', data: { name: 'Beta' } },
    //     ];
    //
    //     await inviteCloudDataSource.saveAll(items as any, 'any_cid');
    //
    //     const results = await inviteCloudDataSource.fetchAll('other_cid');
    //
    //     expect(results).toHaveLength(2);
    //     expect(results.find(r => r.id === 'cloud_1')).toBeDefined();
    //     expect(results.find(r => r.id === 'cloud_2')).toBeDefined();
    // });
    //
    // it('clear: 테이블의 모든 데이터를 삭제해야 한다', async () => {
    //     await inviteCloudDataSource.save('c1', { name: 'A' } as any, 'any');
    //     await inviteCloudDataSource.clear();
    //
    //     const results = await inviteCloudDataSource.fetchAll('any');
    //     expect(results).toHaveLength(0);
    // });
});
