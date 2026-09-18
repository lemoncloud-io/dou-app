import type { CacheChatView, ChatQueryOptions, LastChatItem } from '@chatic/app-messages';
import type { ICacheDataSource } from './types';
import type { ISqliteDatabase } from '../../database';
import { fetchManyByIds } from './fetchManyByIds';

/**
 * Determines whether a row is previewable — a SQL mirror of the web's `isPreviewableChat`
 * (@chatic/data) (ADR-0057).
 *
 * Excludes thread replies (parentId), system rows (including reaction events), and failed sends,
 * but keeps tombstones (hidden) — the channel's last message that renders as "Deleted message."
 * The fields used for this check have no extracted column, so we read the blob via
 * `json_extract`; each probe walks `idx_chats_cid_uid_channel_chatno` in newest-first order and
 * stops at the first match, so the number of rows evaluated is proportional to the length of the
 * non-previewable tail (not the whole channel history).
 *
 * This check is only an optimization — the web owns the semantics. The web re-validates the
 * returned rows against its own rules and, if they don't match, falls back to a windowed query
 * for just that channel. That's why an older app version can't force a wrong answer even as the
 * rules evolve.
 */
const PREVIEWABLE_SQL = [
    `json_extract(data, '$.parentId') IS NULL`,
    `COALESCE(json_extract(data, '$.stereo'), '') <> 'system'`,
    `COALESCE(json_extract(data, '$.subType'), '') <> 'reaction'`,
    `COALESCE(json_extract(data, '$.isFailed'), 0) = 0`,
].join(' AND ');

/**
 * Data source implementation specific to the Chat domain
 */
export class ChatDataSource implements ICacheDataSource<CacheChatView, ChatQueryOptions> {
    constructor(
        private readonly database: ISqliteDatabase,
        private readonly tableName: string
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

        // Add the pagination cursor condition (less than cursorNo)
        if (query?.cursorNo !== undefined && query.cursorNo !== null) {
            conditions.push(`chat_no < ?`);
            params.push(query.cursorNo);
        }

        if (conditions.length > 0) sql += ` WHERE ` + conditions.join(' AND ');

        // Set the sort order (defaults to DESC when unspecified, since that fits chat listings best)
        const sortOrder = query?.sort ? query.sort.toUpperCase() : 'DESC';
        sql += ` ORDER BY chat_no ${sortOrder}`;

        // Add the pagination LIMIT condition
        if (query?.limit !== undefined && query.limit !== null) {
            sql += ` LIMIT ?`;
            params.push(query.limit);
        }

        const result = await this.database.execute(sql, params);

        return (result.rows || []).map((row: any) => JSON.parse(row.data as string) as CacheChatView);
    }

    /**
     * Fetches, per channel, one latest preview row plus that channel's max chat_no
     * (ADR-0057, `FetchLastChatsData`).
     *
     * Uses 3 index probes per channel — the committed top-1 (previewable rows, DESC LIMIT 1), the
     * unsent candidate (`chat_no = 0`, excluding failures — picking the most recent createdAt in
     * JS), and `MAX(chat_no)`. If an unsent message exists, it wins (the same semantics as the
     * web's `compareByChatNo`, which treats 0 as the newest — a message you just sent must be
     * previewable even before it's acked). The query count is 3N, but they're all in-process index
     * walks, so the cost unit is round trips, not query count (same rationale as `fetchManyByIds`).
     *
     * The returned array follows the request order, but the caller (the web) re-indexes it by channelId.
     */
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

            const committedResult = await this.database.execute(
                `SELECT data FROM ${this.tableName} WHERE ${scopeSql}channel_id = ? AND chat_no > 0 AND ${PREVIEWABLE_SQL} ORDER BY chat_no DESC LIMIT 1`,
                channelParams
            );
            const pendingResult = await this.database.execute(
                `SELECT data FROM ${this.tableName} WHERE ${scopeSql}channel_id = ? AND chat_no = 0 AND ${PREVIEWABLE_SQL}`,
                channelParams
            );
            const maxResult = await this.database.execute(
                `SELECT MAX(chat_no) AS last_no FROM ${this.tableName} WHERE ${scopeSql}channel_id = ?`,
                channelParams
            );

            const committed = (committedResult.rows || []).map(
                (row: any) => JSON.parse(row.data as string) as CacheChatView
            )[0];
            // Among unsent messages, chat_no is always 0, so createdAt is the only ordering axis.
            // A channel typically has 0-2 such rows, so taking the max once is enough instead of sorting.
            const pending = (pendingResult.rows || [])
                .map((row: any) => JSON.parse(row.data as string) as CacheChatView)
                .reduce<
                    CacheChatView | undefined
                >((best, chat) => (!best || (chat.createdAt ?? 0) >= (best.createdAt ?? 0) ? chat : best), undefined);
            const lastNo = Number((maxResult.rows?.[0] as any)?.last_no ?? 0) || 0;

            results.push({ channelId, lastNo, item: pending ?? committed ?? null });
        }

        return results;
    }

    public async save(id: string, item: CacheChatView, cid: string, uid: string): Promise<void> {
        const sql = `INSERT OR REPLACE INTO ${this.tableName} (cid, uid, id, channel_id, chat_no, created_at, content, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
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

        await this.database.execute(sql, [cid, uid, id, channelId, chatNo, createdAt, content, dataToSave]);
    }

    public async saveAll(items: { id: string; data: CacheChatView }[], cid: string, uid: string): Promise<void> {
        if (items.length === 0) return;
        const sql = `INSERT OR REPLACE INTO ${this.tableName} (cid, uid, id, channel_id, chat_no, created_at, content, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

        const commands: [string, any[]][] = items.map(item => {
            const id = item.id;
            const chatData = item.data;

            const channelId = chatData.channelId || '';
            const chatNo = chatData.chatNo || 0;
            const createdAt = chatData.createdAt || 0;
            const content = chatData.content || '';

            const dataToSave = JSON.stringify({
                ...chatData,
                id,
                cid,
                uid,
                channelId,
                chatNo,
                createdAt,
            });

            return [sql, [cid, uid, id, channelId, chatNo, createdAt, content, dataToSave]];
        });

        await this.database.executeBatch(commands);
    }

    public async remove(id: string, cid: string, uid: string): Promise<void> {
        await this.database.execute(`DELETE FROM ${this.tableName} WHERE id = ? AND cid = ? AND uid = ?`, [
            id,
            cid,
            uid,
        ]);
    }

    public async removeAll(ids: string[], cid: string, uid: string): Promise<void> {
        if (ids.length === 0) return;
        const sql = `DELETE FROM ${this.tableName} WHERE id = ? AND cid = ? AND uid = ?`;
        await this.database.executeBatch(ids.map(id => [sql, [id, cid, uid]]));
    }

    /**
     * Deletes only the rows for one channel (ADR-0067). `channel_id` is an extracted column used
     * for lookups, so the condition works as-is.
     *
     * The scope (cid/uid) is included in the condition too — the same device's other cloud accounts
     * or other users could share the same channel id, and leaving one room shouldn't wipe their
     * history too.
     */
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
        await this.database.execute(`DELETE FROM ${this.tableName} WHERE ${conditions.join(' AND ')}`, params);
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
        const sql =
            conditions.length > 0
                ? `DELETE FROM ${this.tableName} WHERE ${conditions.join(' AND ')}`
                : `DELETE FROM ${this.tableName}`;
        await this.database.execute(sql, params);
    }
}
