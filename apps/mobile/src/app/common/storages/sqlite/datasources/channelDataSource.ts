import type { ChannelView } from '@lemoncloud/chatic-socials-api';
import { database, TABLES } from '../core';
import { createScopedDataSource } from './factory';

const baseChannelDataSource = createScopedDataSource<ChannelView>(TABLES.CHANNELS);

/**
 * Extract 'sid' safely from the item.
 * Using 'any' here because the base ChannelView type might not explicitly define 'sid' yet.
 */
const extractSid = (item: any): string => {
    return item?.sid ? String(item.sid) : '';
};

/**
 * Data source specifically tailored for the Channel domain.
 * Extends the base ScopedCacheDataSource with custom implementations to
 * extract and index 'sid' (Site ID) for optimized querying.
 */
export const channelDataSource = {
    ...baseChannelDataSource,

    /**
     * Overrides the default save method to extract 'sid'.
     * This allows SQLite to index this column for fast site filtering.
     */
    save: async (id: string, item: ChannelView, cid: string): Promise<void> => {
        const query = `INSERT OR REPLACE INTO ${TABLES.CHANNELS} (cid, id, sid, data) VALUES (?, ?, ?, ?)`;
        const params = [cid, id, extractSid(item), JSON.stringify(item)];
        await database.execute(query, params);
    },

    /**
     * Overrides the default saveAll method for batch insertions.
     * Extracts 'sid' for each item to maintain index integrity.
     */
    saveAll: async (items: { id: string; data: ChannelView }[], cid: string): Promise<void> => {
        if (items.length === 0) return;

        const query = `INSERT OR REPLACE INTO ${TABLES.CHANNELS} (cid, id, sid, data) VALUES (?, ?, ?, ?)`;

        // Using any[] for commands due to op-sqlite's executeBatch tuple requirement
        const commands: [string, any[]][] = items.map(item => [
            query,
            [cid, item.id, extractSid(item.data), JSON.stringify(item.data)],
        ]);

        await database.executeBatch(commands);
    },

    /**
     * Fetches channels belonging to a specific cloud (cid) and optionally filters by site (sid).
     *
     * @param cid Optional Cloud ID to scope the query. If omitted, fetches across all clouds.
     * @param sid Optional Site ID to filter channels.
     * @returns A promise that resolves to an array of parsed ChannelView objects.
     */
    fetchChannels: async (cid?: string, sid?: string): Promise<ChannelView[]> => {
        let query = `SELECT data FROM ${TABLES.CHANNELS}`;
        const params: (string | number)[] = [];
        const conditions: string[] = [];

        if (cid) {
            conditions.push(`cid = ?`);
            params.push(cid);
        }
        if (sid) {
            conditions.push(`sid = ?`);
            params.push(sid);
        }

        if (conditions.length > 0) {
            query += ` WHERE ` + conditions.join(' AND ');
        }

        const result = await database.execute(query, params);
        const rows = result.rows || [];

        return rows
            .map(row => {
                try {
                    // Using any cast to safely access 'data' from op-sqlite's Record result
                    const dataString = (row as any).data as string;
                    return JSON.parse(dataString) as ChannelView;
                } catch {
                    return null;
                }
            })
            .filter((item: ChannelView | null): item is ChannelView => item !== null);
    },
};
