import type { Logger } from '@chatic/logger';

import { SQLITE_FILE_NAME, openSqliteDatabase } from './opSqlite';

const execute = jest.fn(async () => ({ rows: [{ user_version: 0 }], rowsAffected: 0 }));
const open = jest.fn((_options: { name: string }) => ({
    execute,
    executeBatch: jest.fn(),
    transaction: jest.fn(async (fn: (tx: { execute: typeof execute }) => Promise<void>) => fn({ execute })),
    close: jest.fn(),
}));

jest.mock('@op-engineering/op-sqlite', () => ({ open: (options: { name: string }) => open(options) }));

const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } as unknown as Logger;

describe('openSqliteDatabase', () => {
    it('opens the dou.sqlite file installed apps already hold', async () => {
        const database = openSqliteDatabase(logger);
        await database.execute('SELECT 1');

        expect(SQLITE_FILE_NAME).toBe('dou.sqlite');
        expect(open).toHaveBeenCalledWith({ name: 'dou.sqlite' });
        expect(execute).toHaveBeenCalledWith('SELECT 1', undefined);
    });
});
