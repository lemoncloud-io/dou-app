import type { SQLBatchTuple, Scalar } from '@op-engineering/op-sqlite';
import { CHAT_MEDIA_KINDS } from '@chatic/bridge-messages';
import type {
    CacheChatView,
    ChatMediaCacheItem,
    ChatMediaCounts,
    ChatMediaFillItem,
    ChatMediaKind,
    ChatMediaPage,
    ChatQueryOptions,
    LastChatItem,
} from '@chatic/bridge-messages';
import type { IChatCacheDataSource } from './types';
import type { ISqliteDatabase } from '../../database';
import { TABLES } from '../../database/sqlite/tables';
import { fetchManyByIds } from './fetchManyByIds';

interface MediaRow {
    chat_id: string;
    idx: number;
    chat_no: number;
    kind: ChatMediaKind;
    ref: string;
    data: string;
}

const ACTIVITY_SQL = [
    `COALESCE(json_extract(data, '$.stereo'), '') <> 'system'`,
    `COALESCE(json_extract(data, '$.subType'), '') <> 'reaction'`,
    `COALESCE(json_extract(data, '$.isFailed'), 0) = 0`,
].join(' AND ');

const PREVIEWABLE_SQL = `COALESCE(json_extract(data, '$.parentId'), '') = '' AND ${ACTIVITY_SQL}`;

export class ChatDataSource implements IChatCacheDataSource<CacheChatView, ChatQueryOptions> {
    constructor(
        private readonly database: ISqliteDatabase,
        private readonly tableName: string,
        private readonly mediaTableName: string = TABLES.CHAT_MEDIA
    ) {}

    public async fetch(id: string, cid?: string, uid?: string): Promise<CacheChatView | null> {
        let query = `SELECT data FROM ${this.tableName} WHERE id = ?`;
        const params: (string | number)[] = [id];
        if (cid) {
            query += ` AND cid = ?`;
            params.push(cid);
        }
        if (uid) {
            query += ` AND uid = ?`;
            params.push(uid);
        }
        const result = await this.database.execute(query, params);

        if (result.rows && result.rows.length > 0) {
            return JSON.parse(result.rows[0].data as string) as CacheChatView;
        }
        return null;
    }

    public async fetchMany(ids: string[], cid?: string, uid?: string): Promise<CacheChatView[]> {
        return fetchManyByIds<CacheChatView>(this.database, this.tableName, ids, cid, uid);
    }

    public async fetchAll(cid?: string, query?: ChatQueryOptions, uid?: string): Promise<CacheChatView[]> {
        let sql = `SELECT data FROM ${this.tableName}`;
        const params: (string | number)[] = [];
        const conditions: string[] = [];

        if (cid) {
            conditions.push(`cid = ?`);
            params.push(cid);
        }
        if (uid) {
            conditions.push(`uid = ?`);
            params.push(uid);
        }
        if (query?.channelId) {
            conditions.push(`channel_id = ?`);
            params.push(query.channelId);
        }

        if (query?.keyword) {
            conditions.push(`content LIKE ?`);
            params.push(`%${query.keyword}%`);
        }

        if (query?.cursorNo !== undefined && query.cursorNo !== null) {
            conditions.push(`chat_no < ?`);
            params.push(query.cursorNo);
        }

        if (conditions.length > 0) sql += ` WHERE ` + conditions.join(' AND ');

        const sortOrder = query?.sort ? query.sort.toUpperCase() : 'DESC';
        sql += ` ORDER BY chat_no ${sortOrder}`;

        if (query?.limit !== undefined && query.limit !== null) {
            sql += ` LIMIT ?`;
            params.push(query.limit);
        }

        const result = await this.database.execute(sql, params);

        return (result.rows || []).map((row: any) => JSON.parse(row.data as string) as CacheChatView);
    }

    public async fetchLastPerChannel(channelIds: string[], cid?: string, uid?: string): Promise<LastChatItem[]> {
        const uniqueIds = Array.from(new Set(channelIds.filter(Boolean)));
        if (uniqueIds.length === 0) return [];

        const scopeConditions: string[] = [];
        const scopeParams: (string | number)[] = [];
        if (cid) {
            scopeConditions.push('cid = ?');
            scopeParams.push(cid);
        }
        if (uid) {
            scopeConditions.push('uid = ?');
            scopeParams.push(uid);
        }
        const scopeSql = scopeConditions.length > 0 ? `${scopeConditions.join(' AND ')} AND ` : '';

        const results: LastChatItem[] = [];
        for (const channelId of uniqueIds) {
            const channelParams = [...scopeParams, channelId];

            const probe = async (rule: string): Promise<CacheChatView | undefined> => {
                const committedResult = await this.database.execute(
                    `SELECT data FROM ${this.tableName} WHERE ${scopeSql}channel_id = ? AND chat_no > 0 AND ${rule} ORDER BY chat_no DESC LIMIT 1`,
                    channelParams
                );
                const pendingResult = await this.database.execute(
                    `SELECT data FROM ${this.tableName} WHERE ${scopeSql}channel_id = ? AND chat_no = 0 AND ${rule}`,
                    channelParams
                );
                const committed = (committedResult.rows || []).map(
                    (row: any) => JSON.parse(row.data as string) as CacheChatView
                )[0];
                const pending = (pendingResult.rows || [])
                    .map((row: any) => JSON.parse(row.data as string) as CacheChatView)
                    .reduce<
                        CacheChatView | undefined
                    >((best, chat) => (!best || (chat.createdAt ?? 0) >= (best.createdAt ?? 0) ? chat : best), undefined);
                return pending ?? committed;
            };

            const activity = await probe(ACTIVITY_SQL);
            const preview = activity && activity.parentId ? await probe(PREVIEWABLE_SQL) : activity;

            const maxResult = await this.database.execute(
                `SELECT MAX(chat_no) AS last_no FROM ${this.tableName} WHERE ${scopeSql}channel_id = ?`,
                channelParams
            );
            const lastNo = Number((maxResult.rows?.[0] as any)?.last_no ?? 0) || 0;

            results.push({ channelId, lastNo, item: preview ?? null, activityItem: activity ?? null });
        }

        return results;
    }

    private rowCommands(id: string, item: CacheChatView, cid: string, uid: string): SQLBatchTuple[] {
        const channelId = item.channelId || '';
        const chatNo = item.chatNo || 0;
        const createdAt = item.createdAt || 0;
        const content = item.content || '';

        const dataToSave = JSON.stringify({
            ...item,
            id,
            cid,
            uid,
            channelId,
            chatNo,
            createdAt,
        });

        const commands: SQLBatchTuple[] = [
            [
                `INSERT OR REPLACE INTO ${this.tableName} (cid, uid, id, channel_id, chat_no, created_at, content, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [cid, uid, id, channelId, chatNo, createdAt, content, dataToSave],
            ],
        ];
        if (Array.isArray(item.mediaEntries)) {
            commands.push([
                `DELETE FROM ${this.mediaTableName} WHERE cid = ? AND uid = ? AND chat_id = ?`,
                [cid, uid, id],
            ]);
            for (const entry of item.mediaEntries) {
                commands.push([
                    `INSERT OR REPLACE INTO ${this.mediaTableName} (cid, uid, chat_id, idx, channel_id, chat_no, kind, ref) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [cid, uid, id, entry.idx, channelId, chatNo, entry.kind, entry.ref],
                ]);
            }
        }
        return commands;
    }

    public async save(id: string, item: CacheChatView, cid: string, uid: string): Promise<void> {
        await this.database.executeBatch(this.rowCommands(id, item, cid, uid));
    }

    public async saveAll(items: { id: string; data: CacheChatView }[], cid: string, uid: string): Promise<void> {
        if (items.length === 0) return;
        await this.database.executeBatch(items.flatMap(item => this.rowCommands(item.id, item.data, cid, uid)));
    }

    public async remove(id: string, cid: string, uid: string): Promise<void> {
        await this.database.executeBatch([
            [`DELETE FROM ${this.tableName} WHERE id = ? AND cid = ? AND uid = ?`, [id, cid, uid]],
            [`DELETE FROM ${this.mediaTableName} WHERE chat_id = ? AND cid = ? AND uid = ?`, [id, cid, uid]],
        ]);
    }

    public async removeAll(ids: string[], cid: string, uid: string): Promise<void> {
        if (ids.length === 0) return;
        const sql = `DELETE FROM ${this.tableName} WHERE id = ? AND cid = ? AND uid = ?`;
        const mediaSql = `DELETE FROM ${this.mediaTableName} WHERE chat_id = ? AND cid = ? AND uid = ?`;
        await this.database.executeBatch(
            ids.flatMap((id): SQLBatchTuple[] => [
                [sql, [id, cid, uid]],
                [mediaSql, [id, cid, uid]],
            ])
        );
    }

    public async clearByChannel(channelId: string, cid?: string, uid?: string): Promise<void> {
        const conditions: string[] = ['channel_id = ?'];
        const params: string[] = [channelId];
        if (cid) {
            conditions.push('cid = ?');
            params.push(cid);
        }
        if (uid) {
            conditions.push('uid = ?');
            params.push(uid);
        }
        const where = conditions.join(' AND ');
        await this.database.executeBatch([
            [`DELETE FROM ${this.tableName} WHERE ${where}`, params],
            [`DELETE FROM ${this.mediaTableName} WHERE ${where}`, params],
        ]);
    }

    public async clear(cid?: string, uid?: string): Promise<void> {
        const conditions: string[] = [];
        const params: string[] = [];
        if (cid) {
            conditions.push('cid = ?');
            params.push(cid);
        }
        if (uid) {
            conditions.push('uid = ?');
            params.push(uid);
        }
        const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
        await this.database.executeBatch([
            [`DELETE FROM ${this.tableName}${where}`, params],
            [`DELETE FROM ${this.mediaTableName}${where}`, params],
        ]);
    }

    public async fetchMediaPage(
        query: { channelId: string; kind: ChatMediaKind; cursorNo?: number; limit: number },
        cid: string,
        uid: string
    ): Promise<ChatMediaPage> {
        const limit = Math.max(1, Math.floor(query.limit) || 1);
        const base = `FROM ${this.mediaTableName} m JOIN ${this.tableName} c ON c.cid = m.cid AND c.uid = m.uid AND c.id = m.chat_id WHERE m.cid = ? AND m.uid = ? AND m.channel_id = ? AND m.kind = ?`;
        const select = `SELECT m.chat_id, m.idx, m.chat_no, m.kind, m.ref, c.data ${base}`;
        const scope: Scalar[] = [cid, uid, query.channelId, query.kind];

        const below = query.cursorNo !== undefined && query.cursorNo !== null;
        const head = await this.database.execute(
            `${select}${below ? ' AND m.chat_no < ?' : ''} ORDER BY m.chat_no DESC, m.idx ASC LIMIT ?`,
            below ? [...scope, query.cursorNo as number, limit] : [...scope, limit]
        );
        const headRows = (head.rows || []) as unknown as MediaRow[];
        if (headRows.length < limit) return { items: headRows.map(toMediaItem), nextCursorNo: null };

        const boundaryNo = headRows[headRows.length - 1].chat_no;
        const boundary = await this.database.execute(`${select} AND m.chat_no = ? ORDER BY m.chat_id ASC, m.idx ASC`, [
            ...scope,
            boundaryNo,
        ]);
        const rows = [
            ...headRows.filter(row => row.chat_no > boundaryNo),
            ...((boundary.rows || []) as unknown as MediaRow[]),
        ];
        const more = await this.database.execute(
            `SELECT 1 AS found FROM ${this.mediaTableName} WHERE cid = ? AND uid = ? AND channel_id = ? AND kind = ? AND chat_no < ? LIMIT 1`,
            [...scope, boundaryNo]
        );
        return { items: rows.map(toMediaItem), nextCursorNo: (more.rows || []).length > 0 ? boundaryNo : null };
    }

    public async saveMediaFill(items: ChatMediaFillItem[], version: number, cid: string, uid: string): Promise<void> {
        if (items.length === 0) return;
        const stale = `EXISTS (SELECT 1 FROM ${this.tableName} c WHERE c.cid = ? AND c.uid = ? AND c.id = ? AND COALESCE(json_extract(c.data, '$.mediaEntriesVersion'), 0) < ?)`;
        const commands: SQLBatchTuple[] = [];
        for (const item of items) {
            const guard: Scalar[] = [cid, uid, item.chatId, version];
            commands.push([
                `DELETE FROM ${this.mediaTableName} WHERE cid = ? AND uid = ? AND chat_id = ? AND ${stale}`,
                [cid, uid, item.chatId, ...guard],
            ]);
            for (const entry of item.entries) {
                commands.push([
                    `INSERT OR REPLACE INTO ${this.mediaTableName} (cid, uid, chat_id, idx, channel_id, chat_no, kind, ref) SELECT c.cid, c.uid, c.id, ?, c.channel_id, c.chat_no, ?, ? FROM ${this.tableName} c WHERE c.cid = ? AND c.uid = ? AND c.id = ? AND COALESCE(json_extract(c.data, '$.mediaEntriesVersion'), 0) < ?`,
                    [entry.idx, entry.kind, entry.ref, ...guard],
                ]);
            }
        }
        await this.database.executeBatch(commands);
    }

    public async countMedia(channelId: string, cid: string, uid: string): Promise<ChatMediaCounts> {
        const result = await this.database.execute(
            `SELECT kind, COUNT(*) AS n FROM ${this.mediaTableName} WHERE cid = ? AND uid = ? AND channel_id = ? GROUP BY kind`,
            [cid, uid, channelId]
        );
        const counts = Object.fromEntries(CHAT_MEDIA_KINDS.map(kind => [kind, 0])) as ChatMediaCounts;
        for (const row of (result.rows || []) as unknown as Array<{ kind: ChatMediaKind; n: number }>) {
            if (row.kind in counts) counts[row.kind] = Number(row.n) || 0;
        }
        return counts;
    }
}

const toMediaItem = (row: MediaRow): ChatMediaCacheItem => ({
    kind: row.kind,
    idx: Number(row.idx),
    ref: row.ref,
    chatId: row.chat_id,
    chatNo: Number(row.chat_no),
    chat: JSON.parse(row.data) as CacheChatView,
});
