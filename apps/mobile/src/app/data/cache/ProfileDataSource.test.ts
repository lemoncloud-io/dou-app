import type { CacheProfileView } from '@chatic/app-messages';
import type { ISqliteDatabase } from '../../database';
import { ProfileDataSource } from './ProfileDataSource';

const TABLE = 'profiles';

const createSqliteMock = (): ISqliteDatabase =>
    ({
        initTables: jest.fn(),
        execute: jest.fn(),
        executeBatch: jest.fn(),
        backup: jest.fn(),
        restore: jest.fn(),
        close: jest.fn(),
    }) as any;

// Minimal profile shape; only the fields the data source serializes matter here.
const makeProfile = (overrides: Partial<CacheProfileView> = {}): CacheProfileView =>
    ({
        id: 's1@u1',
        cid: 'c1',
        sid: 's1',
        uid: 'u1',
        userId: 'u1',
        updatedAtMs: 100,
        ...overrides,
    }) as CacheProfileView;

describe('ProfileDataSource', () => {
    it('fetch는 id/cid/uid 조건으로 조회하고 data를 JSON 파싱해 반환해야 한다', async () => {
        const sqlite = createSqliteMock();
        const dataSource = new ProfileDataSource(sqlite, TABLE);
        const profile = makeProfile();

        (sqlite.execute as jest.Mock).mockResolvedValueOnce({ rows: [{ data: JSON.stringify(profile) }] });

        const result = await dataSource.fetch('s1@u1', 'c1', 'u1');

        expect(result).toEqual(profile);
        const [query, params] = (sqlite.execute as jest.Mock).mock.calls[0];
        expect(String(query)).toContain(`SELECT data FROM ${TABLE} WHERE id = ?`);
        expect(String(query)).toContain('AND cid = ?');
        expect(String(query)).toContain('AND uid = ?');
        expect(params).toEqual(['s1@u1', 'c1', 'u1']);
    });

    it('fetch는 매칭 row가 없으면 null을 반환해야 한다', async () => {
        const sqlite = createSqliteMock();
        const dataSource = new ProfileDataSource(sqlite, TABLE);

        (sqlite.execute as jest.Mock).mockResolvedValueOnce({ rows: [] });

        expect(await dataSource.fetch('missing', 'c1', 'u1')).toBeNull();
    });

    it('fetchAll은 cid/uid 스코프로 조회하고 sid 쿼리는 무시해야 한다', async () => {
        const sqlite = createSqliteMock();
        const dataSource = new ProfileDataSource(sqlite, TABLE);
        const rows = [makeProfile({ id: 's1@u1' }), makeProfile({ id: 's1@u2', uid: 'u2', userId: 'u2' })];

        (sqlite.execute as jest.Mock).mockResolvedValueOnce({
            rows: rows.map(item => ({ data: JSON.stringify(item) })),
        });

        // Pass a sid query to prove it does not reach SQL (web filters sid in memory).
        const result = await dataSource.fetchAll('c1', { sid: 's1' }, 'u1');

        expect(result).toEqual(rows);
        const [query, params] = (sqlite.execute as jest.Mock).mock.calls[0];
        expect(String(query)).toContain('cid = ?');
        expect(String(query)).toContain('uid = ?');
        expect(String(query)).not.toContain('sid');
        expect(params).toEqual(['c1', 'u1']);
    });

    it('save는 스코프 uid로 프로필 소유자 uid를 덮어쓰지 않고 id만 row key에 맞춰야 한다', async () => {
        const sqlite = createSqliteMock();
        const dataSource = new ProfileDataSource(sqlite, TABLE);
        // Profile of another member, cached under the logged-in user's ('me') scope.
        const profile = makeProfile({ id: 'stale', sid: 's1', uid: 'u2', userId: 'u2', nick: 'Bob' } as any);

        await dataSource.save('s1@u2', profile, 'c1', 'me');

        const [query, params] = (sqlite.execute as jest.Mock).mock.calls[0];
        expect(String(query)).toContain(`INSERT OR REPLACE INTO ${TABLE} (cid, uid, id, data)`);
        // Scope lives in the row columns only.
        expect(params.slice(0, 3)).toEqual(['c1', 'me', 's1@u2']);
        const stored = JSON.parse(params[3]);
        // The payload keeps the profile OWNER's uid; only `id` is aligned with the row key.
        expect(stored).toMatchObject({ id: 's1@u2', sid: 's1', uid: 'u2', userId: 'u2', nick: 'Bob' });
    });

    it('saveAll은 executeBatch로 일괄 upsert하고 각 프로필의 소유자 uid를 보존해야 한다', async () => {
        const sqlite = createSqliteMock();
        const dataSource = new ProfileDataSource(sqlite, TABLE);

        await dataSource.saveAll([], 'c1', 'me');
        expect(sqlite.executeBatch).not.toHaveBeenCalled();

        await dataSource.saveAll(
            [
                { id: 's1@u1', data: makeProfile({ id: 's1@u1', uid: 'u1', userId: 'u1' }) },
                { id: 's1@u2', data: makeProfile({ id: 's1@u2', uid: 'u2', userId: 'u2' }) },
            ],
            'c1',
            'me'
        );
        const commands = (sqlite.executeBatch as jest.Mock).mock.calls[0][0];
        expect(commands).toHaveLength(2);
        expect(String(commands[0][0])).toContain(`INSERT OR REPLACE INTO ${TABLE}`);
        expect(commands[0][1].slice(0, 3)).toEqual(['c1', 'me', 's1@u1']);
        expect(commands[1][1].slice(0, 3)).toEqual(['c1', 'me', 's1@u2']);
        // Every row must keep its own owner uid, otherwise the web layer collapses
        // all member profiles onto the single canonical key `sid@myUid`.
        expect(JSON.parse(commands[0][1][3])).toMatchObject({ id: 's1@u1', uid: 'u1' });
        expect(JSON.parse(commands[1][1][3])).toMatchObject({ id: 's1@u2', uid: 'u2' });
    });

    it('remove는 id/cid/uid 조건으로 DELETE를 실행해야 한다', async () => {
        const sqlite = createSqliteMock();
        const dataSource = new ProfileDataSource(sqlite, TABLE);

        await dataSource.remove('s1@u1', 'c1', 'u1');

        const [query, params] = (sqlite.execute as jest.Mock).mock.calls[0];
        expect(String(query)).toContain(`DELETE FROM ${TABLE} WHERE id = ? AND cid = ? AND uid = ?`);
        expect(params).toEqual(['s1@u1', 'c1', 'u1']);
    });

    it('removeAll은 빈 배열이면 no-op, 아니면 executeBatch로 일괄 삭제해야 한다', async () => {
        const sqlite = createSqliteMock();
        const dataSource = new ProfileDataSource(sqlite, TABLE);

        await dataSource.removeAll([], 'c1', 'u1');
        expect(sqlite.executeBatch).not.toHaveBeenCalled();

        await dataSource.removeAll(['s1@u1', 's1@u2'], 'c1', 'u1');
        const commands = (sqlite.executeBatch as jest.Mock).mock.calls[0][0];
        expect(commands).toHaveLength(2);
        expect(commands[0][1]).toEqual(['s1@u1', 'c1', 'u1']);
        expect(commands[1][1]).toEqual(['s1@u2', 'c1', 'u1']);
    });

    it('clear는 스코프가 있으면 조건부 DELETE, 없으면 테이블 전체 DELETE를 실행해야 한다', async () => {
        const sqlite = createSqliteMock();
        const dataSource = new ProfileDataSource(sqlite, TABLE);

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
