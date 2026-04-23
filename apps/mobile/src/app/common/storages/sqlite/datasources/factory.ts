import { database } from '../core';

/**
 * Data source interface for scoped data that requires a Cloud ID (CID).
 * - Read operations (fetch, fetchAll) can optionally use CID for strict matching.
 * - Write/Delete operations (save, remove) STRICTLY require a CID.
 *
 * @template T The type of the data model stored in this data source.
 */
export interface ScopedCacheDataSource<T> {
    /** The SQLite table name */
    tableName: string;

    /**
     * Retrieves a single item by its ID.
     */
    fetch: (id: string, cid?: string) => Promise<T | null>;

    /**
     * Retrieves all items.
     * @param cid Optional Cloud ID to filter items by a specific scope.
     */
    fetchAll: (cid?: string) => Promise<T[]>;

    /** Inserts or replaces a single item. CID is strictly required. */
    save: (id: string, item: T, cid: string) => Promise<void>;

    /** Batch inserts or replaces multiple items for optimal performance. CID is strictly required. */
    saveAll: (items: { id: string; data: T }[], cid: string) => Promise<void>;

    /** Deletes a single item. CID is strictly required. */
    remove: (id: string, cid: string) => Promise<void>;

    /** Batch deletes multiple items by their IDs. CID is strictly required. */
    removeAll: (ids: string[], cid: string) => Promise<void>;

    /* Clear All Items */
    clear: () => Promise<void>;
}

/**
 * Factory function to create a ScopedCacheDataSource.
 * Ideal for domain data that belongs to a specific cloud/workspace (e.g., Chats, Channels, Users).
 *
 * @template T The type of the data model.
 * @param tableName The name of the SQLite table (e.g., 'channels', 'users').
 * @returns A fully constructed ScopedCacheDataSource.
 */
export const createScopedDataSource = <T>(tableName: string): ScopedCacheDataSource<T> => {
    const fetch = async (id: string, cid?: string): Promise<T | null> => {
        const query = cid
            ? `SELECT data FROM ${tableName} WHERE id = ? AND cid = ?`
            : `SELECT data FROM ${tableName} WHERE id = ?`;
        const params = cid ? [id, cid] : [id];

        const result = await database.execute(query, params);
        const rows = result.rows || [];

        if (rows.length > 0) {
            try {
                return JSON.parse(rows[0].data as string) as T;
            } catch {
                return null;
            }
        }
        return null;
    };

    const fetchAll = async (cid?: string): Promise<T[]> => {
        const query = cid ? `SELECT data FROM ${tableName} WHERE cid = ?` : `SELECT data FROM ${tableName}`;
        const params = cid ? [cid] : [];

        const result = await database.execute(query, params);
        const rows = result.rows || [];

        return rows
            .map(row => {
                try {
                    return JSON.parse(row.data as string) as T;
                } catch {
                    return null;
                }
            })
            .filter((item: T | null): item is T => item !== null);
    };

    const save = async (id: string, item: T, cid: string): Promise<void> => {
        const query = `INSERT OR REPLACE INTO ${tableName} (cid, id, data) VALUES (?, ?, ?)`;
        await database.execute(query, [cid, id, JSON.stringify(item)]);
    };

    const saveAll = async (items: { id: string; data: T }[], cid: string): Promise<void> => {
        if (items.length === 0) return;
        const query = `INSERT OR REPLACE INTO ${tableName} (cid, id, data) VALUES (?, ?, ?)`;

        const commands: [string, any[]][] = items.map(item => [query, [cid, item.id, JSON.stringify(item.data)]]);
        await database.executeBatch(commands);
    };

    const remove = async (id: string, cid: string): Promise<void> => {
        const query = `DELETE FROM ${tableName} WHERE id = ? AND cid = ?`;
        await database.execute(query, [id, cid]);
    };

    const removeAll = async (ids: string[], cid: string): Promise<void> => {
        if (ids.length === 0) return;
        const query = `DELETE FROM ${tableName} WHERE id = ? AND cid = ?`;

        const commands: [string, any[]][] = ids.map(id => [query, [id, cid]]);
        await database.executeBatch(commands);
    };

    const clear = async (): Promise<void> => {
        const query = `DELETE FROM ${tableName}`;
        await database.execute(query, []);
    };

    return { tableName, fetch, fetchAll, save, saveAll, remove, removeAll, clear };
};
