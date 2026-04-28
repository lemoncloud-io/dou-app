import Database from 'better-sqlite3';
import { userDataSource } from './userDataSource';
import { MIGRATIONS, TARGET_VERSION, TABLES } from '../core';

const mockDb = new Database(':memory:');

jest.mock('../core/database', () => ({
    database: {
        execute: jest.fn(async (query, params = []) => {
            const stmt = mockDb.prepare(query);
            return query.trim().toUpperCase().startsWith('SELECT')
                ? { rows: stmt.all(params) }
                : { rows: [], changes: stmt.run(params).changes };
        }),
        executeBatch: jest.fn(async cmds => {
            mockDb.transaction(c => c.forEach(([sql, p]) => mockDb.prepare(sql).run(p)))(cmds);
        }),
    },
}));

describe('UserDataSource Test', () => {
    beforeAll(() => {
        mockDb.transaction(() => {
            for (let v = 0; v < TARGET_VERSION; v++) MIGRATIONS[v]?.forEach(sql => mockDb.exec(sql));
            mockDb.pragma(`user_version = ${TARGET_VERSION}`);
        })();
    });

    beforeEach(() => {
        mockDb.exec(`DELETE FROM ${TABLES.USERS}`);
        jest.clearAllMocks();
    });

    it('fetchAll: 특정 cid에 속한 유저들만 정확히 반환해야 한다', async () => {
        await userDataSource.save('u1', { nickname: 'A' } as any, 'cloud_A');
        await userDataSource.save('u2', { nickname: 'B' } as any, 'cloud_B');

        const results = await userDataSource.fetchAll('cloud_A'); //
        expect(results).toHaveLength(1);
        expect(results[0].nickname).toBe('A');
    });

    it('saveAll: 대량 저장 시 모든 객체에 id와 cid가 패치되어야 한다', async () => {
        const users = [
            { id: 'user_1', data: {} },
            { id: 'user_2', data: {} },
        ];
        await userDataSource.saveAll(users as any, 'batch_cloud');

        const results = await userDataSource.fetchAll('batch_cloud');
        expect(results.every(u => u.id && u.cid === 'batch_cloud')).toBe(true); //
    });
});
