import type { JoinView } from '@lemoncloud/chatic-socials-api';
import type { ScopedCacheDataSource } from './factory';
import { createScopedDataSource } from './factory';
import { database, TABLES } from '../core';

const safeCid = (cid?: string | null) => cid || '';
const baseJoinDataSource: ScopedCacheDataSource<JoinView> = createScopedDataSource<JoinView>(TABLES.JOINS);

export const joinDataSource = {
    ...baseJoinDataSource,

    save: async (id: string, item: JoinView, cid?: string): Promise<void> => {
        const query = `INSERT OR REPLACE INTO joins (cid, id, channel_id, user_id, data) VALUES (?, ?, ?, ?, ?)`;
        const params = [safeCid(cid), id, item.channelId || '', item.userId || '', JSON.stringify(item)];
        await database.execute(query, params);
    },

    saveAll: async (items: { id: string; data: JoinView }[], cid?: string): Promise<void> => {
        const query = `INSERT OR REPLACE INTO joins (cid, id, channel_id, user_id, data) VALUES (?, ?, ?, ?, ?)`;
        const commands: [string, any[]][] = items.map(item => [
            query,
            [safeCid(cid), item.id, item.data.channelId || '', item.data.userId || '', JSON.stringify(item.data)],
        ]);

        if (commands.length > 0) {
            await database.executeBatch(commands);
        }
    },

    fetchJoins: async (cid: string, options: { channelId?: string; userId?: string }): Promise<JoinView[]> => {
        let query = `SELECT data FROM joins WHERE cid = ?`;
        const params: any[] = [safeCid(cid)];

        if (options.channelId) {
            query += ` AND channel_id = ?`;
            params.push(options.channelId);
        }
        if (options.userId) {
            query += ` AND user_id = ?`;
            params.push(options.userId);
        }

        const result = await database.execute(query, params);
        const rows = result.rows || [];

        return rows
            .map((row: any) => {
                try {
                    return JSON.parse(row.data as string) as JoinView;
                } catch (e) {
                    return null;
                }
            })
            .filter((item: JoinView | null): item is JoinView => item !== null);
    },
};
