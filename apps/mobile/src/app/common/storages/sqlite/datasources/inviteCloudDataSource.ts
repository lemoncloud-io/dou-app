import type { CacheSiteView } from '@chatic/app-messages';
import { TABLES } from '../core';
import { database } from '../core';

export const inviteCloudDataSource = {
    fetch: async (id: string): Promise<CacheSiteView | null> => {
        const result = await database.execute(`SELECT data FROM ${TABLES.INVITE_CLOUDS} WHERE id = ?`, [id]);
        const rows = result.rows || [];
        if (rows.length === 0) return null;
        try {
            return JSON.parse(rows[0].data as string) as CacheSiteView;
        } catch {
            return null;
        }
    },

    fetchAll: async (): Promise<CacheSiteView[]> => {
        const result = await database.execute(`SELECT data FROM ${TABLES.INVITE_CLOUDS}`);
        const rows = result.rows || [];
        return rows.reduce<CacheSiteView[]>((acc, row) => {
            try {
                acc.push(JSON.parse(row.data as string) as CacheSiteView);
            } catch {
                // skip invalid
            }
            return acc;
        }, []);
    },

    save: async (id: string, item: CacheSiteView): Promise<void> => {
        await database.execute(`INSERT OR REPLACE INTO ${TABLES.INVITE_CLOUDS} (id, data) VALUES (?, ?)`, [
            id,
            JSON.stringify(item),
        ]);
    },

    remove: async (id: string): Promise<void> => {
        await database.execute(`DELETE FROM ${TABLES.INVITE_CLOUDS} WHERE id = ?`, [id]);
    },

    removeAll: async (): Promise<void> => {
        await database.execute(`DELETE FROM ${TABLES.INVITE_CLOUDS}`);
    },
};
