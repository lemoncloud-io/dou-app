import Database from 'better-sqlite3';
import { siteDataSource } from './siteDataSource';
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

describe('SiteDataSource Test', () => {
    beforeAll(() => {
        mockDb.transaction(() => {
            for (let v = 0; v < TARGET_VERSION; v++) MIGRATIONS[v]?.forEach(sql => mockDb.exec(sql));
            mockDb.pragma(`user_version = ${TARGET_VERSION}`);
        })();
    });

    beforeEach(() => {
        mockDb.exec(`DELETE FROM ${TABLES.SITES}`);
        jest.clearAllMocks();
    });

    it('fetchAll: name 컬럼을 이용한 키워드 검색이 정상 작동해야 한다', async () => {
        const sites = [
            { id: 's1', data: { name: 'Apple' } },
            { id: 's2', data: { name: 'Banana' } },
        ];
        await siteDataSource.saveAll(sites as any, 'c1');

        const results = await siteDataSource.fetchAll('c1', { keyword: 'App' });
        expect(results).toHaveLength(1);
        expect(results[0].name).toBe('Apple');
    });

    it('Patch Integrity: 저장 시 전달된 파라미터가 JSON 데이터를 덮어써야 한다', async () => {
        await siteDataSource.save('site_id', { name: 'Old' } as any, 'new_cid');

        const fetched = await siteDataSource.fetch('site_id', 'new_cid');
        expect(fetched?.id).toBe('site_id');
        expect(fetched?.cid).toBe('new_cid');
    });
});
