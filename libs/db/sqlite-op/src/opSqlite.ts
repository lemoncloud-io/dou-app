import { SqliteDatabase } from '@chatic/db-sqlite';
import type { SqliteDriver } from '@chatic/db-sqlite';
import type { Logger } from '@chatic/logger';
import { open } from '@op-engineering/op-sqlite';

export const SQLITE_FILE_NAME = 'dou.sqlite';

export const openOpSqlite = (name: string = SQLITE_FILE_NAME): SqliteDriver => open({ name });

export const openSqliteDatabase = (logger: Logger, name: string = SQLITE_FILE_NAME): SqliteDatabase =>
    new SqliteDatabase(logger, openOpSqlite(name));
