import type { Scalar, SQLBatchTuple, QueryResult, BatchQueryResult } from '@op-engineering/op-sqlite';

export interface IKeyValueStorage {
    set<T>(key: string, value: T): Promise<void>;
    get<T>(key: string): Promise<T | null>;
    /** Synchronous write. For values read back before the first paint (see getSync). */
    setSync<T>(key: string, value: T): void;
    /**
     * Synchronous read. The backing store (MMKV) is natively synchronous, so first-paint values
     * such as the theme can be read during module evaluation instead of after an async rehydrate.
     */
    getSync<T>(key: string): T | null;
    remove(key: string): Promise<void>;
    clearAll(): Promise<void>;
    getAllKeys(): string[];
}

export interface ISqliteDatabase {
    initTables(): Promise<void>;
    /**
     * Returns the `PRAGMA user_version` that was **actually reached** after migrations finish.
     *
     * This can differ from `TARGET_VERSION` (the intended value), and that gap is the whole reason
     * this method exists — since the entire migration runs as a single transaction, a failure in
     * any one step rolls everything back and this value never advances. In other words, this one
     * number fully determines "which tables exist" (ADR-0053 decision 8).
     */
    getSchemaVersion(): Promise<number>;
    /**
     * Executes a single SQL query.
     *
     * @param query - the SQL query string to execute (e.g. `SELECT * FROM users WHERE id = ?`)
     * @param params - array of parameters to bind to the query's `?` placeholders (optional)
     * @returns the query result. For SELECT queries, the result data is returned in the `rows` array.
     */
    execute(query: string, params?: Scalar[]): Promise<QueryResult>;
    /**
     * Executes multiple SQL queries as a batch.
     * Used to improve performance when inserting, updating, or deleting large amounts of data.
     *
     * @param commands - list of `[SQL query string, parameter array]` tuples to execute
     * @returns a Promise that resolves once the entire batch completes successfully
     */
    executeBatch(commands: SQLBatchTuple[]): Promise<BatchQueryResult>;
    close(): void;
}
