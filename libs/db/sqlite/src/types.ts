export type SqlScalar = string | number | boolean | null | ArrayBuffer | ArrayBufferView;

export type SqlBatchTuple = [string] | [string, SqlScalar[]] | [string, SqlScalar[][]];

export interface SqlQueryResult {
    insertId?: number;
    rowsAffected: number;
    rows: Array<Record<string, SqlScalar>>;
}

export interface SqlBatchResult {
    rowsAffected?: number;
}

export interface SqliteExecutor {
    execute(query: string, params?: SqlScalar[]): Promise<SqlQueryResult>;
}

export interface SqliteDriver extends SqliteExecutor {
    executeBatch(commands: SqlBatchTuple[]): Promise<SqlBatchResult>;
    transaction(fn: (tx: SqliteExecutor) => Promise<void>): Promise<void>;
    close(): void;
}

export interface ISqliteDatabase {
    initTables(): Promise<void>;
    getSchemaVersion(): Promise<number>;
    execute(query: string, params?: SqlScalar[]): Promise<SqlQueryResult>;
    executeBatch(commands: SqlBatchTuple[]): Promise<SqlBatchResult>;
    close(): void;
}
