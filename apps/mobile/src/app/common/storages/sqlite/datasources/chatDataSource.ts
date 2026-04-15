import { database } from '../core';
import { TABLES } from '../core';
import { createScopedDataSource } from './factory';
import type { CacheChatView } from '@chatic/app-messages';

const baseChatDataSource = createScopedDataSource<CacheChatView>(TABLES.CHATS);

/**
 * Data source specifically tailored for the Chat domain.
 * Extends the base ScopedCacheDataSource with custom implementations to
 * extract and index 'channel_id', 'chat_no', 'created_at', and 'content' for optimized querying.
 */
export const chatDataSource = {
    ...baseChatDataSource,

    /**
     * Overrides the default save method to extract 'channel_id', 'chat_no', 'created_at', and 'content'.
     */
    save: async (id: string, item: CacheChatView, cid: string): Promise<void> => {
        const query = `INSERT OR REPLACE INTO chats (cid, id, channel_id, chat_no, created_at, content, data) VALUES (?, ?, ?, ?, ?, ?, ?)`;
        const content = (item as any).text || (item as any).content || '';
        const params = [
            cid,
            id,
            item.channelId || '',
            item.chatNo || 0,
            item.createdAt || 0,
            content,
            JSON.stringify(item),
        ];
        await database.execute(query, params);
    },

    /**
     * Overrides the default saveAll method for batch insertions.
     */
    saveAll: async (items: { id: string; data: CacheChatView }[], cid: string): Promise<void> => {
        const query = `INSERT OR REPLACE INTO chats (cid, id, channel_id, chat_no, created_at, content, data) VALUES (?, ?, ?, ?, ?, ?, ?)`;
        const commands: [string, any[]][] = items.map(item => [
            query,
            [
                cid,
                item.id,
                item.data.channelId || '',
                item.data.chatNo || 0,
                item.data.createdAt || 0,
                (item.data as any).text || (item.data as any).content || '',
                JSON.stringify(item.data),
            ],
        ]);

        if (commands.length > 0) {
            await database.executeBatch(commands);
        }
    },

    /**
     * Fetches chats belonging to a specific cloud (cid), with optional filtering and sorting.
     *
     * @param cid Optional Cloud ID to scope the query. If omitted, fetches across all clouds.
     * @param channelId Optional. If provided, filters chats to only this channel.
     * @param sort Optional. Sorts the results chronologically ('asc' or 'desc') based on chat_no.
     * @param keyword Optional. Keyword to perform a text search across the chat data.
     * @returns A promise that resolves to an array of parsed ChatView objects.
     */
    fetchChats: async (
        cid?: string,
        channelId?: string,
        sort?: 'asc' | 'desc',
        keyword?: string
    ): Promise<CacheChatView[]> => {
        let query = `SELECT data FROM chats`;
        const params: (string | number)[] = [];
        const conditions: string[] = [];

        if (cid) {
            conditions.push(`cid = ?`);
            params.push(cid);
        }
        if (channelId) {
            conditions.push(`channel_id = ?`);
            params.push(channelId);
        }
        if (keyword) {
            conditions.push(`content LIKE ?`);
            params.push(`%${keyword}%`);
        }

        if (conditions.length > 0) {
            query += ` WHERE ` + conditions.join(' AND ');
        }

        if (sort) {
            query += ` ORDER BY chat_no ${sort.toUpperCase()}`;
        }

        const result = await database.execute(query, params);
        const rows = result.rows || [];

        return rows
            .map((row: any) => {
                try {
                    return JSON.parse(row.data as string) as CacheChatView;
                } catch {
                    return null;
                }
            })
            .filter((item: CacheChatView | null): item is CacheChatView => item !== null);
    },
};
