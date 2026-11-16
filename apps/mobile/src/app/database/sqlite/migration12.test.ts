import { ChatDataSource } from '../../data/cache/ChatDataSource';
import { createRealSqliteDatabase, migrate, openMemorySqlite, type BetterSqlite } from './realSqliteDatabase';
import { TARGET_VERSION } from './schema';

/**
 * Migration 12 on a real SQLite: a v12 database with chat rows in it, as a device has it before the
 * update, moved to v13.
 */
describe('migration 12 — chat media table and the restored newest-first chat index', () => {
    let db: BetterSqlite;

    const indexesOf = (table: string) =>
        (db.prepare(`PRAGMA index_list(${table})`).all() as Array<{ name: string }>).map(index => index.name);
    const planOf = (sql: string, ...params: unknown[]) =>
        (db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...params) as Array<{ detail: string }>)
            .map(row => row.detail)
            .join(' | ');

    beforeEach(() => {
        db = openMemorySqlite();
        migrate(db, 0, 12);
        const insert = db.prepare(
            'INSERT INTO chats (cid, uid, id, channel_id, chat_no, created_at, content, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        );
        for (let no = 1; no <= 50; no += 1) {
            insert.run(
                'c1',
                'u1',
                `room:${no}`,
                'room',
                no,
                no,
                `m${no}`,
                JSON.stringify({ id: `room:${no}`, chatNo: no })
            );
        }
    });

    afterEach(() => db.close());

    it('starts from a v12 database without the table or the index', () => {
        expect(db.pragma('user_version', { simple: true })).toBe(12);
        expect(indexesOf('chats')).not.toContain('idx_chats_cid_uid_channel_chatno');
        expect(db.prepare(`SELECT name FROM sqlite_master WHERE name = 'chat_media'`).all()).toEqual([]);
    });

    it('keeps every chat row, adds an empty chat_media table, and creates both indexes', () => {
        migrate(db, 12, TARGET_VERSION);

        expect(db.pragma('user_version', { simple: true })).toBe(13);
        expect(db.prepare('SELECT COUNT(*) AS n FROM chats').all()).toEqual([{ n: 50 }]);
        expect(db.prepare('SELECT COUNT(*) AS n FROM chat_media').all()).toEqual([{ n: 0 }]);
        expect(indexesOf('chat_media')).toContain('idx_chat_media_cid_uid_channel_kind_chatno');
        expect(indexesOf('chats')).toContain('idx_chats_cid_uid_channel_chatno');
    });

    it('reads a room page off the restored index, with no temporary sort', () => {
        migrate(db, 12, TARGET_VERSION);

        const plan = planOf(
            'SELECT data FROM chats WHERE cid = ? AND uid = ? AND channel_id = ? AND chat_no < ? ORDER BY chat_no DESC LIMIT 50',
            'c1',
            'u1',
            'room',
            40
        );

        expect(plan).toContain('idx_chats_cid_uid_channel_chatno');
        expect(plan).not.toContain('TEMP B-TREE');
    });

    it('lists media with no temporary sort and counts it off the index alone', async () => {
        migrate(db, 12, TARGET_VERSION);
        const chats = new ChatDataSource(createRealSqliteDatabase(db), 'chats');
        const listSql: string[] = [];
        const countSql: string[] = [];
        const database = createRealSqliteDatabase(db);
        const spy = new ChatDataSource(
            {
                ...database,
                execute: async (sql, params) => {
                    (sql.includes('COUNT(*)') ? countSql : listSql).push(sql);
                    return database.execute(sql, params);
                },
            },
            'chats'
        );
        await chats.save(
            'room:1',
            {
                id: 'room:1',
                channelId: 'room',
                chatNo: 1,
                mediaEntries: [{ kind: 'image', idx: 0, ref: 'u' }],
            } as never,
            'c1',
            'u1'
        );

        await spy.fetchMediaPage({ channelId: 'room', kind: 'image', cursorNo: 10, limit: 1 }, 'c1', 'u1');
        await spy.countMedia('room', 'c1', 'u1');

        const listPlan = planOf(listSql[0], 'c1', 'u1', 'room', 'image', 10, 1);
        expect(listPlan).toContain('idx_chat_media_cid_uid_channel_kind_chatno');
        expect(listPlan).not.toContain('TEMP B-TREE');
        expect(planOf(countSql[0], 'c1', 'u1', 'room')).toContain(
            'COVERING INDEX idx_chat_media_cid_uid_channel_kind_chatno'
        );
    });

    it('rolls a failed batch back whole, so a row is never left without its entries', async () => {
        migrate(db, 12, TARGET_VERSION);
        const chats = new ChatDataSource(createRealSqliteDatabase(db), 'chats');

        // A NULL ref breaks the entry's NOT NULL constraint after the row and the delete ran.
        await expect(
            chats.save(
                'room:60',
                {
                    id: 'room:60',
                    channelId: 'room',
                    chatNo: 60,
                    mediaEntries: [{ kind: 'image', idx: 0, ref: null }],
                } as never,
                'c1',
                'u1'
            )
        ).rejects.toThrow();

        expect(db.prepare(`SELECT COUNT(*) AS n FROM chats WHERE id = 'room:60'`).all()).toEqual([{ n: 0 }]);
    });
});
