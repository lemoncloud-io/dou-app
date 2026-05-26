import type { TestRecord } from '@chatic/app-messages';
import type { ISqliteDatabase } from '../../database';

export class TestRecordDataSource {
    constructor(
        private readonly database: ISqliteDatabase,
        private readonly tableName: string
    ) {}

    public async fetch(key: string): Promise<TestRecord | null> {
        const query = `SELECT key, value, updated_at FROM ${this.tableName} WHERE key = ?`;
        const result = await this.database.execute(query, [key]);

        if (result.rows && result.rows.length > 0) {
            const row = result.rows[0];
            return {
                key: row.key as string,
                value: row.value as string,
                updated_at: row.updated_at as number,
            };
        }
        return null;
    }

    public async fetchAll(keys?: string[]): Promise<TestRecord[]> {
        let query = `SELECT key, value, updated_at FROM ${this.tableName}`;
        const params: string[] = [];

        if (keys && keys.length > 0) {
            const placeholders = keys.map(() => '?').join(', ');
            query += ` WHERE key IN (${placeholders})`;
            params.push(...keys);
        }

        const result = await this.database.execute(query, params);
        return (result.rows || []).map((row: any) => ({
            key: row.key as string,
            value: row.value as string,
            updated_at: row.updated_at as number,
        }));
    }

    public async save(key: string, value: string, updatedAt: number): Promise<void> {
        const sql = `INSERT OR REPLACE INTO ${this.tableName} (key, value, updated_at) VALUES (?, ?, ?)`;
        await this.database.execute(sql, [key, value, updatedAt]);
    }

    public async saveAll(items: Array<{ key: string; value: string }>, updatedAt: number): Promise<void> {
        if (items.length === 0) return;
        const sql = `INSERT OR REPLACE INTO ${this.tableName} (key, value, updated_at) VALUES (?, ?, ?)`;

        const commands: [string, any[]][] = items.map(item => [sql, [item.key, item.value, updatedAt]]);
        await this.database.executeBatch(commands);
    }

    public async clear(): Promise<void> {
        const query = `DELETE FROM ${this.tableName}`;
        await this.database.execute(query);
    }
}
