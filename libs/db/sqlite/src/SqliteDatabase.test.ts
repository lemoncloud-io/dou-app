import type { Logger } from '@chatic/logger';

import { MIGRATIONS, TARGET_VERSION } from './schema';
import { SqliteDatabase } from './SqliteDatabase';
import type { SqliteDriver, SqliteExecutor, SqlQueryResult } from './types';

const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } as unknown as Logger;

const result = (rows: Array<Record<string, number>> = []): SqlQueryResult => ({ rows, rowsAffected: 0 });

const fakeDriver = (userVersion: number) => {
    const statements: string[] = [];
    let version = userVersion;
    const execute = jest.fn(async (query: string) => {
        statements.push(query);
        if (query === 'PRAGMA user_version') return result([{ user_version: version }]);
        const set = /^PRAGMA user_version = (\d+)$/.exec(query);
        if (set) version = Number(set[1]);
        return result();
    });
    const tx: SqliteExecutor = { execute };
    const driver: SqliteDriver & { statements: string[] } = {
        statements,
        execute,
        executeBatch: jest.fn(async () => ({ rowsAffected: 0 })),
        transaction: jest.fn(async fn => fn(tx)),
        close: jest.fn(),
    };
    return driver;
};

describe('SqliteDatabase', () => {
    it('runs every migration from the stored version up to the target, in one transaction', async () => {
        const driver = fakeDriver(TARGET_VERSION - 1);
        const database = new SqliteDatabase(logger, driver);

        await database.execute('SELECT 1');

        expect(driver.transaction).toHaveBeenCalledTimes(1);
        expect(driver.statements).toEqual([
            'PRAGMA user_version',
            ...(MIGRATIONS[TARGET_VERSION - 1] ?? []),
            `PRAGMA user_version = ${TARGET_VERSION}`,
            'SELECT 1',
        ]);
        expect(await database.getSchemaVersion()).toBe(TARGET_VERSION);
    });

    it('leaves a database already at the target untouched', async () => {
        const driver = fakeDriver(TARGET_VERSION);
        const database = new SqliteDatabase(logger, driver);

        await database.executeBatch([['SELECT 1']]);

        expect(driver.statements).toEqual(['PRAGMA user_version']);
        expect(driver.executeBatch).toHaveBeenCalledWith([['SELECT 1']]);
    });

    it('logs a failed migration and still answers queries', async () => {
        const driver = fakeDriver(0);
        driver.transaction = jest.fn(async () => {
            throw new Error('disk full');
        });
        const database = new SqliteDatabase(logger, driver);

        await database.execute('SELECT 1');

        expect(logger.error).toHaveBeenCalledWith('SQLITE', 'Migration failed:', expect.any(Error));
    });
});
