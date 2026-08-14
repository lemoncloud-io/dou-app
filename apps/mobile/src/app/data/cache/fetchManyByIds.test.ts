import type { ISqliteDatabase } from '../../database';
import { fetchManyByIds } from './fetchManyByIds';

/**
 * `id IN (...)` 조회의 최소 흉내: 파라미터 중 알려진 id인 것만 행으로 돌려줍니다. cid/uid는 id 뒤에
 * 붙는 스칼라라 이 규칙에 걸리지 않으므로 별도 분리가 필요 없습니다.
 */
const createDatabase = (rowsById: Record<string, unknown>) => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const database = {
        async execute(sql: string, params?: unknown[]) {
            calls.push({ sql, params: params ?? [] });
            const ids = (params ?? []).filter(param => typeof param === 'string' && param in rowsById) as string[];
            return { rows: ids.map(id => ({ data: JSON.stringify(rowsById[id]) })) };
        },
        async executeBatch() {
            return {} as never;
        },
    } as unknown as ISqliteDatabase;
    return { database, calls };
};

describe('fetchManyByIds', () => {
    it('빈 id 목록이면 쿼리를 실행하지 않는다', async () => {
        const { database, calls } = createDatabase({});
        await expect(fetchManyByIds(database, 'users', [])).resolves.toEqual([]);
        expect(calls).toHaveLength(0);
    });

    it('id 개수만큼 플레이스홀더를 만들고 한 번의 쿼리로 읽는다', async () => {
        const { database, calls } = createDatabase({ u1: { id: 'u1' }, u2: { id: 'u2' } });

        const result = await fetchManyByIds(database, 'users', ['u1', 'u2'], 'c1', 'me');

        expect(calls).toHaveLength(1);
        expect(calls[0].sql).toContain('id IN (?, ?)');
        expect(calls[0].sql).toContain('cid = ?');
        expect(calls[0].sql).toContain('uid = ?');
        expect(calls[0].params).toEqual(['u1', 'u2', 'c1', 'me']);
        expect(result).toEqual([{ id: 'u1' }, { id: 'u2' }]);
    });

    it('cid/uid가 없으면 조건에 넣지 않는다 — invitecloud처럼 전역인 테이블의 fetch 규칙과 같다', async () => {
        const { database, calls } = createDatabase({ c1: { id: 'c1' } });

        await fetchManyByIds(database, 'invite_clouds', ['c1']);

        expect(calls[0].sql).not.toContain('cid = ?');
        expect(calls[0].sql).not.toContain('uid = ?');
        expect(calls[0].params).toEqual(['c1']);
    });

    it('중복 id는 SQL 이전에 접는다', async () => {
        const { database, calls } = createDatabase({ u1: { id: 'u1' } });

        await fetchManyByIds(database, 'users', ['u1', 'u1', 'u1']);

        expect(calls[0].sql).toContain('id IN (?)');
        expect(calls[0].params).toEqual(['u1']);
    });

    it('바인딩 상한을 넘는 id는 청크로 나눠 읽는다 (브릿지 왕복은 그래도 1회)', async () => {
        const ids = Array.from({ length: 1000 }, (_, index) => `u${index}`);
        const rowsById = Object.fromEntries(ids.map(id => [id, { id }]));
        const { database, calls } = createDatabase(rowsById);

        const result = await fetchManyByIds(database, 'users', ids);

        expect(calls).toHaveLength(2);
        expect(calls[0].params).toHaveLength(900);
        expect(calls[1].params).toHaveLength(100);
        expect(result).toHaveLength(1000);
    });
});
