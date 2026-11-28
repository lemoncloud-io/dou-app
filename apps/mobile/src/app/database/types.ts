import type { Scalar, SQLBatchTuple, QueryResult, BatchQueryResult } from '@op-engineering/op-sqlite';

export interface ISqliteDatabase {
    initTables(): Promise<void>;
    getSchemaVersion(): Promise<number>;
    execute(query: string, params?: Scalar[]): Promise<QueryResult>;
    executeBatch(commands: SQLBatchTuple[]): Promise<BatchQueryResult>;
    close(): void;
}
