import type { CacheMetaView } from '@chatic/app-messages';
import type { ISqliteDatabase } from '../../database';
import { MetaDataSource } from './MetaDataSource';

const TABLE = 'metas';

const createSqliteMock = (): ISqliteDatabase =>
    ({
        initTables: jest.fn(),
        execute: jest.fn(),
        executeBatch: jest.fn(),
        backup: jest.fn(),
        restore: jest.fn(),
        close: jest.fn(),
    }) as any;

const makeMeta = (overrides: Partial<CacheMetaView> = {}): CacheMetaView => ({
    id: 'channel-sync',
    cid: 'c1',
    uid: 'u1',
    syncedAt: 1700,
    ...overrides,
});

describe('MetaDataSource', () => {
    it('fetch는 id/cid/uid 조건으로 조회하고 syncedAt을 포함한 data를 파싱해 반환해야 한다', async () => {
        const sqlite = createSqliteMock();
        const dataSource = new MetaDataSource(sqlite, TABLE);
        const meta = makeMeta();

        (sqlite.execute as jest.Mock).mockResolvedValueOnce({ rows: [{ data: JSON.stringify(meta) }] });

        const result = await dataSource.fetch('channel-sync', 'c1', 'u1');

        expect(result).toEqual(meta);
        const [query, params] = (sqlite.execute as jest.Mock).mock.calls[0];
        expect(String(query)).toContain(`SELECT data FROM ${TABLE} WHERE id = ?`);
        expect(params).toEqual(['channel-sync', 'c1', 'u1']);
    });

    it('fetch는 커서가 없으면 null을 반환해야 한다 (호출자는 0으로 해석)', async () => {
        const sqlite = createSqliteMock();
        const dataSource = new MetaDataSource(sqlite, TABLE);

        (sqlite.execute as jest.Mock).mockResolvedValueOnce({ rows: [] });

        expect(await dataSource.fetch('channel-sync', 'c1', 'u1')).toBeNull();
    });

    it('save는 INSERT OR REPLACE로 id(커서 종류)/cid/uid가 병합된 data를 저장해야 한다', async () => {
        const sqlite = createSqliteMock();
        const dataSource = new MetaDataSource(sqlite, TABLE);

        await dataSource.save('channel-sync', makeMeta({ syncedAt: 42 }), 'c1', 'u1');

        const [query, params] = (sqlite.execute as jest.Mock).mock.calls[0];
        expect(String(query)).toContain(`INSERT OR REPLACE INTO ${TABLE} (cid, uid, id, data)`);
        expect(params.slice(0, 3)).toEqual(['c1', 'u1', 'channel-sync']);
        expect(JSON.parse(params[3])).toMatchObject({ id: 'channel-sync', cid: 'c1', uid: 'u1', syncedAt: 42 });
    });

    it('clear는 스코프가 있으면 조건부 DELETE, 없으면 전체 DELETE를 실행해야 한다', async () => {
        const sqlite = createSqliteMock();
        const dataSource = new MetaDataSource(sqlite, TABLE);

        await dataSource.clear('c1', 'u1');
        let [query, params] = (sqlite.execute as jest.Mock).mock.calls[0];
        expect(String(query)).toContain(`DELETE FROM ${TABLE} WHERE cid = ? AND uid = ?`);
        expect(params).toEqual(['c1', 'u1']);

        await dataSource.clear();
        [query, params] = (sqlite.execute as jest.Mock).mock.calls[1];
        expect(String(query).trim()).toBe(`DELETE FROM ${TABLE}`);
        expect(params).toEqual([]);
    });
});
