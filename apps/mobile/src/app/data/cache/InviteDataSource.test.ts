import type { CacheInviteView } from '@chatic/app-messages';
import type { ISqliteDatabase } from '../../database';
import { InviteDataSource } from './InviteDataSource';

const TABLE = 'invites';

const createSqliteMock = (): ISqliteDatabase =>
    ({
        initTables: jest.fn(),
        execute: jest.fn(),
        executeBatch: jest.fn(),
        backup: jest.fn(),
        restore: jest.fn(),
        close: jest.fn(),
    }) as any;

const makeInvite = (overrides: Partial<CacheInviteView> = {}): CacheInviteView => ({
    id: 'invite-1',
    cid: 'default',
    uid: 'u1',
    state: 'pending',
    ...overrides,
});

describe('InviteDataSource', () => {
    it('fetch는 id/cid/uid 조건으로 조회하고 data를 파싱해 반환해야 한다', async () => {
        const sqlite = createSqliteMock();
        const dataSource = new InviteDataSource(sqlite, TABLE);
        const invite = makeInvite();

        (sqlite.execute as jest.Mock).mockResolvedValueOnce({ rows: [{ data: JSON.stringify(invite) }] });

        const result = await dataSource.fetch('invite-1', 'default', 'u1');

        expect(result).toEqual(invite);
        const [query, params] = (sqlite.execute as jest.Mock).mock.calls[0];
        expect(String(query)).toContain(`SELECT data FROM ${TABLE} WHERE id = ?`);
        expect(params).toEqual(['invite-1', 'default', 'u1']);
    });

    it('fetch는 행이 없으면 null을 반환해야 한다', async () => {
        const sqlite = createSqliteMock();
        const dataSource = new InviteDataSource(sqlite, TABLE);

        (sqlite.execute as jest.Mock).mockResolvedValueOnce({ rows: [] });

        expect(await dataSource.fetch('invite-1', 'default', 'u1')).toBeNull();
    });

    it('fetchAll은 cid/uid 스코프로 필터링된 목록을 반환해야 한다', async () => {
        const sqlite = createSqliteMock();
        const dataSource = new InviteDataSource(sqlite, TABLE);
        const invite = makeInvite();

        (sqlite.execute as jest.Mock).mockResolvedValueOnce({ rows: [{ data: JSON.stringify(invite) }] });

        const result = await dataSource.fetchAll('default', undefined, 'u1');

        expect(result).toEqual([invite]);
        const [query, params] = (sqlite.execute as jest.Mock).mock.calls[0];
        expect(String(query)).toContain(`WHERE cid = ? AND uid = ?`);
        expect(params).toEqual(['default', 'u1']);
    });

    it('save는 INSERT OR REPLACE로 id/cid/uid가 병합된 data를 저장해야 한다', async () => {
        const sqlite = createSqliteMock();
        const dataSource = new InviteDataSource(sqlite, TABLE);

        await dataSource.save('invite-1', makeInvite({ state: 'rejected' }), 'default', 'u1');

        const [query, params] = (sqlite.execute as jest.Mock).mock.calls[0];
        expect(String(query)).toContain(`INSERT OR REPLACE INTO ${TABLE} (cid, uid, id, data)`);
        expect(params.slice(0, 3)).toEqual(['default', 'u1', 'invite-1']);
        expect(JSON.parse(params[3])).toMatchObject({ id: 'invite-1', cid: 'default', uid: 'u1', state: 'rejected' });
    });

    it('saveAll은 배치로 여러 행을 저장해야 한다', async () => {
        const sqlite = createSqliteMock();
        const dataSource = new InviteDataSource(sqlite, TABLE);

        await dataSource.saveAll(
            [
                { id: 'invite-1', data: makeInvite({ id: 'invite-1' }) },
                { id: 'invite-2', data: makeInvite({ id: 'invite-2' }) },
            ],
            'default',
            'u1'
        );

        expect(sqlite.executeBatch).toHaveBeenCalledTimes(1);
        const commands = (sqlite.executeBatch as jest.Mock).mock.calls[0][0];
        expect(commands).toHaveLength(2);
    });

    it('saveAll은 빈 배열이면 아무것도 실행하지 않아야 한다', async () => {
        const sqlite = createSqliteMock();
        const dataSource = new InviteDataSource(sqlite, TABLE);

        await dataSource.saveAll([], 'default', 'u1');

        expect(sqlite.executeBatch).not.toHaveBeenCalled();
    });

    it('remove는 id/cid/uid 조건으로 단일 행을 삭제해야 한다', async () => {
        const sqlite = createSqliteMock();
        const dataSource = new InviteDataSource(sqlite, TABLE);

        await dataSource.remove('invite-1', 'default', 'u1');

        const [query, params] = (sqlite.execute as jest.Mock).mock.calls[0];
        expect(String(query)).toContain(`DELETE FROM ${TABLE} WHERE id = ? AND cid = ? AND uid = ?`);
        expect(params).toEqual(['invite-1', 'default', 'u1']);
    });

    it('clear는 스코프가 있으면 조건부 DELETE, 없으면 전체 DELETE를 실행해야 한다', async () => {
        const sqlite = createSqliteMock();
        const dataSource = new InviteDataSource(sqlite, TABLE);

        await dataSource.clear('default', 'u1');
        let [query, params] = (sqlite.execute as jest.Mock).mock.calls[0];
        expect(String(query)).toContain(`DELETE FROM ${TABLE} WHERE cid = ? AND uid = ?`);
        expect(params).toEqual(['default', 'u1']);

        await dataSource.clear();
        [query, params] = (sqlite.execute as jest.Mock).mock.calls[1];
        expect(String(query).trim()).toBe(`DELETE FROM ${TABLE}`);
        expect(params).toEqual([]);
    });
});
