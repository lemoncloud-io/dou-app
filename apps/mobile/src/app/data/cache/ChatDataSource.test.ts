import type { CacheChatView } from '@chatic/app-messages';
import type { ISqliteDatabase } from '../../database';
import { ChatDataSource } from './ChatDataSource';

const TABLE = 'chats';

const createSqliteMock = (): ISqliteDatabase =>
    ({
        initTables: jest.fn(),
        getSchemaVersion: jest.fn(),
        execute: jest.fn(),
        executeBatch: jest.fn(),
        backup: jest.fn(),
        restore: jest.fn(),
        close: jest.fn(),
    }) as any;

const makeChat = (overrides: Partial<CacheChatView> = {}): CacheChatView =>
    ({
        id: 'm1',
        channelId: 'ch-1',
        chatNo: 1,
        content: 'hello',
        createdAt: 1000,
        ...overrides,
    }) as CacheChatView;

const asRow = (chat: CacheChatView) => ({ data: JSON.stringify(chat) });

describe('ChatDataSource.fetchLastPerChannel (ADR-0057)', () => {
    it('채널당 3프로브(커밋 top-1 / 미전송 / MAX)를 스코프 조건과 함께 실행한다', async () => {
        const sqlite = createSqliteMock();
        const dataSource = new ChatDataSource(sqlite, TABLE);

        (sqlite.execute as jest.Mock)
            .mockResolvedValueOnce({ rows: [asRow(makeChat({ id: 'm3', chatNo: 3 }))] }) // committed
            .mockResolvedValueOnce({ rows: [] }) // pending
            .mockResolvedValueOnce({ rows: [{ last_no: 5 }] }); // max

        const result = await dataSource.fetchLastPerChannel(['ch-1'], 'c1', 'u1');

        expect(result).toEqual([{ channelId: 'ch-1', lastNo: 5, item: expect.objectContaining({ id: 'm3' }) }]);

        const calls = (sqlite.execute as jest.Mock).mock.calls;
        expect(calls).toHaveLength(3);
        // Committed probe: the previewable check (SQL) and "1 latest row" must all be in the query.
        expect(String(calls[0][0])).toContain('chat_no > 0');
        expect(String(calls[0][0])).toContain(`json_extract(data, '$.parentId') IS NULL`);
        expect(String(calls[0][0])).toContain(`<> 'system'`);
        expect(String(calls[0][0])).toContain(`<> 'reaction'`);
        expect(String(calls[0][0])).toContain('ORDER BY chat_no DESC LIMIT 1');
        expect(calls[0][1]).toEqual(['c1', 'u1', 'ch-1']);
        // The unsent probe and the MAX probe also go out with the same scope.
        expect(String(calls[1][0])).toContain('chat_no = 0');
        expect(String(calls[2][0])).toContain('MAX(chat_no)');
        expect(calls[2][1]).toEqual(['c1', 'u1', 'ch-1']);
    });

    it('미전송 행이 있으면 커밋 행보다 우선한다 — 방금 보낸 메시지는 ack 전에도 프리뷰다', async () => {
        const sqlite = createSqliteMock();
        const dataSource = new ChatDataSource(sqlite, TABLE);

        (sqlite.execute as jest.Mock)
            .mockResolvedValueOnce({ rows: [asRow(makeChat({ id: 'committed', chatNo: 9 }))] })
            .mockResolvedValueOnce({
                rows: [
                    asRow(makeChat({ id: 'pending-old', chatNo: 0, createdAt: 100 })),
                    asRow(makeChat({ id: 'pending-new', chatNo: 0, createdAt: 200 })),
                ],
            })
            .mockResolvedValueOnce({ rows: [{ last_no: 9 }] });

        const result = await dataSource.fetchLastPerChannel(['ch-1'], 'c1', 'u1');

        // Among unsent messages, the most recent createdAt wins.
        expect(result[0]?.item).toEqual(expect.objectContaining({ id: 'pending-new' }));
        expect(result[0]?.lastNo).toBe(9);
    });

    it('빈 채널(행 없음)은 { lastNo: 0, item: null }로 자리를 채운다', async () => {
        const sqlite = createSqliteMock();
        const dataSource = new ChatDataSource(sqlite, TABLE);

        (sqlite.execute as jest.Mock)
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] })
            // SQLite's MAX() returns a single row with NULL when there are no rows.
            .mockResolvedValueOnce({ rows: [{ last_no: null }] });

        const result = await dataSource.fetchLastPerChannel(['ch-1'], 'c1', 'u1');

        expect(result).toEqual([{ channelId: 'ch-1', lastNo: 0, item: null }]);
    });

    it('중복/빈 channelId는 접고, 빈 목록이면 쿼리 없이 빈 배열을 답한다', async () => {
        const sqlite = createSqliteMock();
        const dataSource = new ChatDataSource(sqlite, TABLE);

        await expect(dataSource.fetchLastPerChannel([], 'c1', 'u1')).resolves.toEqual([]);
        expect(sqlite.execute).not.toHaveBeenCalled();

        (sqlite.execute as jest.Mock).mockResolvedValue({ rows: [] });
        await dataSource.fetchLastPerChannel(['ch-1', 'ch-1', ''], 'c1', 'u1');
        // 1 unique channel × 3 probes.
        expect(sqlite.execute).toHaveBeenCalledTimes(3);
    });
});

describe('ChatDataSource.clearByChannel (ADR-0067)', () => {
    it('채널과 스코프를 모두 조건에 걸어 지운다', async () => {
        const sqlite = createSqliteMock();
        const dataSource = new ChatDataSource(sqlite, TABLE);
        (sqlite.execute as jest.Mock).mockResolvedValue({ rows: [] });

        await dataSource.clearByChannel('ch-1', 'c1', 'u1');

        const [sql, params] = (sqlite.execute as jest.Mock).mock.calls[0];
        expect(sql).toBe(`DELETE FROM ${TABLE} WHERE channel_id = ? AND cid = ? AND uid = ?`);
        // The same device's other cloud accounts or other users could share the same channel id —
        // leaving one room shouldn't wipe their history too.
        expect(params).toEqual(['ch-1', 'c1', 'u1']);
    });

    it('스코프가 없으면 채널 조건만 건다', async () => {
        const sqlite = createSqliteMock();
        const dataSource = new ChatDataSource(sqlite, TABLE);
        (sqlite.execute as jest.Mock).mockResolvedValue({ rows: [] });

        await dataSource.clearByChannel('ch-1');

        const [sql, params] = (sqlite.execute as jest.Mock).mock.calls[0];
        expect(sql).toBe(`DELETE FROM ${TABLE} WHERE channel_id = ?`);
        expect(params).toEqual(['ch-1']);
    });
});
