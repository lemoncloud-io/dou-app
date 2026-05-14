import type { Scalar, SQLBatchTuple, QueryResult, BatchQueryResult } from '@op-engineering/op-sqlite';

export interface IKeyValueStorage {
    set<T>(key: string, value: T): Promise<void>;
    get<T>(key: string): Promise<T | null>;
    remove(key: string): Promise<void>;
    clearAll(): Promise<void>;
    getAllKeys(): string[];
}

export interface ISqliteDatabase {
    initTables(): Promise<void>;
    execute(query: string, params?: Scalar[]): Promise<QueryResult>;
    executeBatch(commands: SQLBatchTuple[]): Promise<BatchQueryResult>;
    backup(destFilePath: string): Promise<void>;
    restore(sourceFilePath: string): Promise<void>;
    close(): void;
}
