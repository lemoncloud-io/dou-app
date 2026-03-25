import type { ChatView } from '@lemoncloud/chatic-socials-api';
import { database } from '../core';
import { TABLES } from '../core';
import { createScopedDataSource } from './factory';

const safeCid = (cid?: string | null) => cid || '';
const baseChatDataSource = createScopedDataSource<ChatView>(TABLES.CHATS);

/**
 * Data source specifically tailored for the Chat domain.
 * Extends the base ScopedCacheDataSource with custom implementations to
 * extract and index 'channel_id', 'chat_no', and 'created_at' for optimized querying.
 */
export const chatDataSource = {
    ...baseChatDataSource,

    /**
     * Overrides the default save method to extract 'channel_id', 'chat_no', and 'created_at'.
     * This allows SQLite to index these columns for fast channel filtering and accurate sorting.
     */
    save: async (id: string, item: ChatView, cid?: string): Promise<void> => {
        const query = `INSERT OR REPLACE INTO chats (cid, id, channel_id, chat_no, created_at, data) VALUES (?, ?, ?, ?, ?, ?)`;
        const params = [
            safeCid(cid),
            id,
            item.channelId || '',
            item.chatNo || 0,
            item.createdAt || 0,
            JSON.stringify(item),
        ];
        await database.execute(query, params);
    },

    /**
     * Overrides the default saveAll method for batch insertions.
     * Extracts 'channel_id', 'chat_no', and 'created_at' for each item to maintain index integrity.
     */
    saveAll: async (items: { id: string; data: ChatView }[], cid?: string): Promise<void> => {
        const query = `INSERT OR REPLACE INTO chats (cid, id, channel_id, chat_no, created_at, data) VALUES (?, ?, ?, ?, ?, ?)`;
        const commands: [string, any[]][] = items.map(item => [
            query,
            [
                safeCid(cid),
                item.id,
                item.data.channelId || '',
                item.data.chatNo || 0,
                item.data.createdAt || 0,
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
     * @param cid The Cloud ID to scope the query.
     * @param channelId Optional. If provided, filters chats to only this channel.
     * @param sort Optional. Sorts the results chronologically ('asc' or 'desc') based on chat_no.
     * @returns A promise that resolves to an array of parsed ChatView objects.
     */
    fetchChats: async (cid?: string, channelId?: string, sort?: 'asc' | 'desc'): Promise<ChatView[]> => {
        let query = `SELECT data FROM chats WHERE cid = ?`;
        const params: any[] = [safeCid(cid)];

        if (channelId) {
            query += ` AND channel_id = ?`;
            params.push(channelId);
        }

        if (sort) {
            query += ` ORDER BY chat_no ${sort.toUpperCase()}`;
        }

        const result = await database.execute(query, params);
        const rows = result.rows || [];

        return rows
            .map((row: any) => {
                try {
                    return JSON.parse(row.data as string) as ChatView;
                } catch (e) {
                    return null;
                }
            })
            .filter((item: ChatView | null): item is ChatView => item !== null);
    },
};
