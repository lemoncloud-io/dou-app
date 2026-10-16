import type { IKeyValueStorage, ISqliteDatabase } from '../../database/types';
import { TABLES } from '../../database/sqlite/tables';
import type { ILogService } from '../log';
import { NativeStorageService } from './NativeStorageService';

const logService = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } as unknown as ILogService;

/** A database whose answers are scripted per SQL statement prefix. */
const createDatabase = (handlers: { pragma?: (table: string) => string[]; select?: (sql: string) => object }) => {
    const execute = jest.fn(async (sql: string) => {
        const pragma = /^PRAGMA table_info\((\w+)\)$/.exec(sql);
        if (pragma) return { rows: (handlers.pragma?.(pragma[1]) ?? []).map(name => ({ name })) };
        if (sql.startsWith('SELECT')) return { rows: [handlers.select?.(sql) ?? {}] };
        return { rows: [] };
    });
    return {
        execute,
        executeBatch: jest.fn(),
        initTables: jest.fn(),
        getSchemaVersion: jest.fn(),
        close: jest.fn(),
    } as unknown as ISqliteDatabase & { execute: typeof execute };
};

const createStorage = (values: Record<string, string>): IKeyValueStorage =>
    ({
        getAllKeys: () => Object.keys(values),
        getByteLength: (key: string) => values[key]?.length ?? 0,
    }) as unknown as IKeyValueStorage;

describe('NativeStorageService', () => {
    beforeEach(() => jest.clearAllMocks());

    describe('summarize', () => {
        it('reports rows and summed column lengths for every cache table', async () => {
            const database = createDatabase({
                pragma: () => ['id', 'data'],
                select: sql =>
                    sql.includes(`FROM ${TABLES.CHATS}`) ? { count: 3, bytes: 120 } : { count: 0, bytes: 0 },
            });
            const service = new NativeStorageService(logService, database, createStorage({}));

            const summary = await service.summarize();

            expect(summary.sqlite.map(entry => entry.name)).toEqual(Object.values(TABLES));
            expect(summary.sqlite.find(entry => entry.name === TABLES.CHATS)).toEqual({
                name: TABLES.CHATS,
                count: 3,
                bytes: 120,
            });
            // The size covers every column, so a NULL in one of them must not null the whole row's sum.
            expect(database.execute).toHaveBeenCalledWith(
                `SELECT COUNT(*) AS count, IFNULL(SUM(IFNULL(LENGTH("id"), 0) + IFNULL(LENGTH("data"), 0)), 0) AS bytes FROM ${TABLES.CHATS}`
            );
        });

        it('marks a table with no columns as missing instead of reading it', async () => {
            const database = createDatabase({ pragma: table => (table === TABLES.INVITES ? [] : ['data']) });
            const service = new NativeStorageService(logService, database, createStorage({}));

            const summary = await service.summarize();

            expect(summary.sqlite.find(entry => entry.name === TABLES.INVITES)).toEqual({
                name: TABLES.INVITES,
                count: 0,
                bytes: 0,
                missing: true,
            });
        });

        it('keeps reporting the other tables when one read throws', async () => {
            const database = createDatabase({ pragma: () => ['data'] });
            database.execute.mockImplementationOnce(async () => {
                throw new Error('disk I/O error');
            });
            const service = new NativeStorageService(logService, database, createStorage({}));

            const summary = await service.summarize();

            expect(summary.sqlite).toHaveLength(Object.values(TABLES).length);
            expect(summary.sqlite.filter(entry => entry.error === 'disk I/O error')).toHaveLength(1);
        });

        it('lists MMKV keys sorted, each with its stored length, and names the unrecoverable table', async () => {
            const service = new NativeStorageService(
                logService,
                createDatabase({}),
                createStorage({ theme: '"dark"', 'config:ui.language': '"ko"' })
            );

            const summary = await service.summarize();

            expect(summary.mmkv).toEqual([
                { name: 'config:ui.language', count: 1, bytes: 4 },
                { name: 'theme', count: 1, bytes: 6 },
            ]);
            expect(summary.unrecoverableTables).toEqual([TABLES.INVITE_CLOUDS]);
            expect(summary.keptTables).toEqual([TABLES.INVITES]);
        });
    });

    describe('clearCache', () => {
        it('empties every table but keeps the invited clouds and the invites by default', async () => {
            const database = createDatabase({});
            const service = new NativeStorageService(logService, database, createStorage({}));

            const result = await service.clearCache({ includeInvitedClouds: false });

            expect(result.kept).toEqual([TABLES.INVITE_CLOUDS, TABLES.INVITES]);
            expect(result.cleared).toHaveLength(Object.values(TABLES).length - 2);
            expect(database.execute).not.toHaveBeenCalledWith(`DELETE FROM ${TABLES.INVITE_CLOUDS}`);
            expect(database.execute).toHaveBeenCalledWith(`DELETE FROM ${TABLES.CHATS}`);
        });

        it('also empties the invited clouds when asked to', async () => {
            const database = createDatabase({});
            const service = new NativeStorageService(logService, database, createStorage({}));

            const result = await service.clearCache({ includeInvitedClouds: true });

            expect(result.kept).toEqual([TABLES.INVITES]);
            expect(database.execute).toHaveBeenCalledWith(`DELETE FROM ${TABLES.INVITE_CLOUDS}`);
        });

        // Invite dismissals exist only on this device; no option of this clear may reach them.
        it('never empties the invites table, even with invited clouds included', async () => {
            const database = createDatabase({});
            const service = new NativeStorageService(logService, database, createStorage({}));

            await service.clearCache({ includeInvitedClouds: true });

            expect(database.execute).not.toHaveBeenCalledWith(`DELETE FROM ${TABLES.INVITES}`);
        });

        it('reports a table whose delete throws as failed and still clears the rest', async () => {
            const database = createDatabase({});
            database.execute.mockImplementation(async (sql: string) => {
                if (sql === `DELETE FROM ${TABLES.PROFILES}`) throw new Error('no such table: profiles');
                return { rows: [] };
            });
            const service = new NativeStorageService(logService, database, createStorage({}));

            const result = await service.clearCache({ includeInvitedClouds: false });

            expect(result.failed).toEqual([TABLES.PROFILES]);
            expect(result.cleared).not.toContain(TABLES.PROFILES);
            expect(result.cleared).toContain(TABLES.TEST_RECORDS);
        });

        it('never touches MMKV', async () => {
            const storage = { ...createStorage({ theme: '"dark"' }), clearAll: jest.fn(), remove: jest.fn() };
            const service = new NativeStorageService(logService, createDatabase({}), storage as IKeyValueStorage);

            await service.clearCache({ includeInvitedClouds: true });

            expect(storage.clearAll).not.toHaveBeenCalled();
            expect(storage.remove).not.toHaveBeenCalled();
        });
    });
});
