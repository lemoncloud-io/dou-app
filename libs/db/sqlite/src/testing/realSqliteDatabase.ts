import { MIGRATIONS } from '../schema';
import type { ISqliteDatabase, SqlBatchResult, SqlBatchTuple, SqlQueryResult, SqlScalar } from '../types';

interface Statement {
    reader: boolean;
    all(...params: unknown[]): Record<string, unknown>[];
    run(...params: unknown[]): { changes: number };
}

export interface BetterSqlite {
    prepare(sql: string): Statement;
    exec(sql: string): void;
    pragma(sql: string, options?: { simple?: boolean }): unknown;
    transaction<T extends (...args: never[]) => unknown>(fn: T): T;
    close(): void;
}

const BetterSqlite3 = require('better-sqlite3') as new (path: string) => BetterSqlite;

export const openMemorySqlite = (): BetterSqlite => new BetterSqlite3(':memory:');

export const migrate = (db: BetterSqlite, from: number, to: number): void => {
    db.transaction(() => {
        for (let version = from; version < to; version += 1) {
            for (const sql of MIGRATIONS[version] ?? []) db.exec(sql);
        }
        db.pragma(`user_version = ${to}`);
    })();
};

const run = (db: BetterSqlite, sql: string, params: SqlScalar[] = []): SqlQueryResult => {
    const statement = db.prepare(sql);
    if (statement.reader) {
        const rows = statement.all(...params);
        return { rows, rowsAffected: 0 } as unknown as SqlQueryResult;
    }
    const { changes } = statement.run(...params);
    return { rows: [], rowsAffected: changes } as unknown as SqlQueryResult;
};

export const createRealSqliteDatabase = (db: BetterSqlite): ISqliteDatabase => ({
    initTables: async () => undefined,
    getSchemaVersion: async () => Number(db.pragma('user_version', { simple: true })),
    execute: async (query: string, params?: SqlScalar[]) => run(db, query, params),
    executeBatch: async (commands: SqlBatchTuple[]) => {
        let rowsAffected = 0;
        db.transaction(() => {
            for (const [sql, params] of commands) {
                rowsAffected += run(db, sql, (params ?? []) as SqlScalar[]).rowsAffected ?? 0;
            }
        })();
        return { rowsAffected } as SqlBatchResult;
    },
    close: () => db.close(),
});
