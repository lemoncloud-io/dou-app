import type { BatchQueryResult, QueryResult, Scalar, SQLBatchTuple } from '@op-engineering/op-sqlite';

import type { ISqliteDatabase } from '../types';
import { MIGRATIONS } from './schema';

/**
 * Test support only — nothing at runtime imports this. A real SQLite (`better-sqlite3`, a dev
 * dependency) behind `ISqliteDatabase`, so a suite runs the data sources' actual SQL instead of a
 * mock that only records strings: the joins, the indexes, page boundaries and deletes are where the
 * cache's bugs live.
 *
 * `executeBatch` wraps its statements in one transaction, as op-sqlite's JS side does (BEGIN, COMMIT,
 * ROLLBACK on failure), so a batch that fails half-way leaves nothing behind here either.
 */

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

// Required rather than imported: the package ships no type declarations, and this keeps them to
// the few methods used here instead of a new `@types` dependency.
const BetterSqlite3 = require('better-sqlite3') as new (path: string) => BetterSqlite;

/** An empty in-memory database. */
export const openMemorySqlite = (): BetterSqlite => new BetterSqlite3(':memory:');

/** Runs migrations `from`..`to - 1` in order, as `SqliteDatabase.initTables` does, and stamps `user_version`. */
export const migrate = (db: BetterSqlite, from: number, to: number): void => {
    db.transaction(() => {
        for (let version = from; version < to; version += 1) {
            for (const sql of MIGRATIONS[version] ?? []) db.exec(sql);
        }
        db.pragma(`user_version = ${to}`);
    })();
};

const run = (db: BetterSqlite, sql: string, params: Scalar[] = []): QueryResult => {
    const statement = db.prepare(sql);
    if (statement.reader) {
        const rows = statement.all(...params);
        return { rows, rowsAffected: 0 } as unknown as QueryResult;
    }
    const { changes } = statement.run(...params);
    return { rows: [], rowsAffected: changes } as unknown as QueryResult;
};

/** `ISqliteDatabase` over a `better-sqlite3` database. */
export const createRealSqliteDatabase = (db: BetterSqlite): ISqliteDatabase => ({
    initTables: async () => undefined,
    getSchemaVersion: async () => Number(db.pragma('user_version', { simple: true })),
    execute: async (query: string, params?: Scalar[]) => run(db, query, params),
    executeBatch: async (commands: SQLBatchTuple[]) => {
        let rowsAffected = 0;
        db.transaction(() => {
            for (const [sql, params] of commands) {
                rowsAffected += run(db, sql, (params ?? []) as Scalar[]).rowsAffected ?? 0;
            }
        })();
        return { rowsAffected } as BatchQueryResult;
    },
    close: () => db.close(),
});
