import Database from 'better-sqlite3';
import { metaDataSource } from './metaDataSource';
import { MIGRATIONS, TARGET_VERSION, TABLES } from '../../../database';

const mockDb = new Database(':memory:');

jest.mock('../../../database', () => ({
    database: {
        execute: jest.fn(async (query, params = []) => {
            const stmt = mockDb.prepare(query);
            return query.trim().toUpperCase().startsWith('SELECT')
                ? { rows: stmt.all(params) }
                : { rows: [], changes: stmt.run(params).changes };
        }),
    },
}));

describe('MetaDataSource Test', () => {
    beforeAll(() => {
        mockDb.transaction(() => {
            for (let v = 0; v < TARGET_VERSION; v++) MIGRATIONS[v]?.forEach(sql => mockDb.exec(sql));
            mockDb.pragma(`user_version = ${TARGET_VERSION}`);
        })();
    });

    beforeEach(() => {
        mockDb.exec(`DELETE FROM ${TABLES.METAS}`);
        jest.clearAllMocks();
    });

    it('save & fetch: 페이징 스냅샷 저장 시 cid가 데이터 내부에 패치되어야 한다', async () => {
        const data = { ids: ['1', '2'], meta: { page: 1 } };
        await metaDataSource.save('chat', 'cloud_1', 'query_key', data);

        const result = await metaDataSource.fetch('chat', 'cloud_1', 'query_key');
        expect(result?.ids).toEqual(['1', '2']);
        expect(result?.cid).toBe('cloud_1'); //
    });

    it('clear: 특정 도메인(type)의 데이터만 선택적으로 초기화해야 한다', async () => {
        await metaDataSource.save('chat', 'c1', 'k1', { ids: [] });
        await metaDataSource.save('site', 'c1', 'k2', { ids: [] });

        await metaDataSource.clear('chat'); //

        expect(await metaDataSource.fetch('chat', 'c1', 'k1')).toBeNull();
        expect(await metaDataSource.fetch('site', 'c1', 'k2')).not.toBeNull();
    });
});
