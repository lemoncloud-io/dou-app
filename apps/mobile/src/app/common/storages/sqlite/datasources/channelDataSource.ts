import { database, TABLES } from '../core';
import { createScopedDataSource } from './factory';
import type { CacheChannelView } from '@chatic/app-messages';

const baseChannelDataSource = createScopedDataSource<CacheChannelView>(TABLES.CHANNELS);

/**
 * Extract 'sid' safely from the item.
 * Using 'any' here because the base CacheChannelView type might not explicitly define 'sid' yet.
 */
const extractSid = (item: any): string => {
    return item?.sid ? String(item.sid) : '';
};

/** Extract 'name' safely for searching */
const extractName = (item: any): string => {
    return item?.name ? String(item.name) : '';
};

/**
 * Data source specifically tailored for the Channel domain.
 * Extends the base ScopedCacheDataSource with custom implementations to
 * extract and index 'sid' (Site ID) for optimized querying.
 */
export const channelDataSource = {
    ...baseChannelDataSource,

    /**
     * Overrides the default save method to extract 'sid' and 'name'.
     * This allows SQLite to index this column for fast site filtering.
     */
    save: async (id: string, item: CacheChannelView, cid: string): Promise<void> => {
        const query = `INSERT OR REPLACE INTO ${TABLES.CHANNELS} (cid, id, sid, name, data) VALUES (?, ?, ?, ?, ?)`;
        const params = [cid, id, extractSid(item), extractName(item), JSON.stringify(item)];
        await database.execute(query, params);
    },

    /**
     * Overrides the default saveAll method for batch insertions.
     * Extracts 'sid' for each item to maintain index integrity.
     */
    saveAll: async (items: { id: string; data: CacheChannelView }[], cid: string): Promise<void> => {
        if (items.length === 0) return;

        const query = `INSERT OR REPLACE INTO ${TABLES.CHANNELS} (cid, id, sid, name, data) VALUES (?, ?, ?, ?, ?)`;

        // Using any[] for commands due to op-sqlite's executeBatch tuple requirement
        const commands: [string, any[]][] = items.map(item => [
            query,
            [cid, item.id, extractSid(item.data), extractName(item.data), JSON.stringify(item.data)],
        ]);

        await database.executeBatch(commands);
    },

    /**
     * Fetches channels belonging to a specific cloud (cid) and optionally filters by site (sid).
     *
     * @param cid Optional Cloud ID to scope the query. If omitted, fetches across all clouds.
     * @param sid Optional Site ID to filter channels.
     * @param keyword Optional. Keyword to perform a text search across the channel data.
     * @returns A promise that resolves to an array of parsed CacheChannelView objects.
     */
    fetchChannels: async (cid?: string, sid?: string, keyword?: string): Promise<CacheChannelView[]> => {
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
        if (keyword) {
            conditions.push(`name LIKE ?`);
            params.push(`%${keyword}%`);
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
                    return JSON.parse(dataString) as CacheChannelView;
                } catch {
                    return null;
                }
            })
            .filter((item: CacheChannelView | null): item is CacheChannelView => item !== null);
    },
};
