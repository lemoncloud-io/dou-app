import type { JoinView } from '@lemoncloud/chatic-socials-api';
import type { ScopedCacheDataSource } from './factory';
import { createScopedDataSource } from './factory';
import { database, TABLES } from '../core';

const baseJoinDataSource: ScopedCacheDataSource<JoinView> = createScopedDataSource<JoinView>(TABLES.JOINS);

export const joinDataSource = {
    ...baseJoinDataSource,

    save: async (id: string, item: JoinView, cid: string): Promise<void> => {
        const query = `INSERT OR REPLACE INTO joins (cid, id, channel_id, user_id, data) VALUES (?, ?, ?, ?, ?)`;
        const params = [cid, id, item.channelId || '', item.userId || '', JSON.stringify(item)];
        await database.execute(query, params);
    },

    saveAll: async (items: { id: string; data: JoinView }[], cid: string): Promise<void> => {
        const query = `INSERT OR REPLACE INTO joins (cid, id, channel_id, user_id, data) VALUES (?, ?, ?, ?, ?)`;
        const commands: [string, any[]][] = items.map(item => [
            query,
            [cid, item.id, item.data.channelId || '', item.data.userId || '', JSON.stringify(item.data)],
        ]);

        if (commands.length > 0) {
            await database.executeBatch(commands);
        }
    },

    fetchJoins: async (cid?: string, options: { channelId?: string; userId?: string } = {}): Promise<JoinView[]> => {
        let query = `SELECT data FROM joins`;
        const params: (string | number)[] = [];
        const conditions: string[] = [];

        if (cid) {
            conditions.push(`cid = ?`);
            params.push(cid);
        }
        if (options.channelId) {
            conditions.push(`channel_id = ?`);
            params.push(options.channelId);
        }
        if (options.userId) {
            conditions.push(`user_id = ?`);
            params.push(options.userId);
        }

        if (conditions.length > 0) {
            query += ` WHERE ` + conditions.join(' AND ');
        }

        const result = await database.execute(query, params);
        const rows = result.rows || [];

        return rows
            .map((row: any) => {
                try {
                    return JSON.parse(row.data as string) as JoinView;
                } catch {
                    return null;
                }
            })
            .filter((item: JoinView | null): item is JoinView => item !== null);
    },
};
