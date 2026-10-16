import type {
    NativeStorageEntry,
    OnClearNativeCachePayload,
    OnFetchNativeStorageSummaryPayload,
} from '@chatic/app-messages';

import type { IKeyValueStorage, ISqliteDatabase } from '../../database/types';
import { TABLES } from '../../database/sqlite/tables';
import type { ILogService } from '../log';

/**
 * The invited-cloud table is the one cache the server cannot refill: there is no list API for the
 * clouds an account was invited to, so a cleared row returns only when a push happens to name it.
 */
const UNRECOVERABLE_TABLES: readonly string[] = [TABLES.INVITE_CLOUDS];

/**
 * Never cleared here. `invites` carries `dismissedAt`, which only this device writes: the server
 * refills the rows but not the stamp, so a clear would bring back every invite card the user closed.
 * Settings' cache clear keeps it for the same reason.
 */
const KEPT_TABLES: readonly string[] = [TABLES.INVITES];

const CACHE_TABLES: readonly string[] = Object.values(TABLES);

export interface INativeStorageService {
    /** Rows and approximate bytes per SQLite table, and bytes per MMKV key. */
    summarize(): Promise<OnFetchNativeStorageSummaryPayload>;
    /**
     * Empties every SQLite cache table except `KEPT_TABLES`; the invited-cloud table only when asked
     * to. MMKV is left alone.
     */
    clearCache(options: { includeInvitedClouds: boolean }): Promise<OnClearNativeCachePayload>;
}

/**
 * The native half of the debug panel's storage screen. The web can measure and wipe only its own
 * storage; inside the app the chat cache and the invited-cloud list live here, so clearing the web
 * side alone used to leave the stale half behind.
 *
 * Table names are interpolated into SQL, which is safe only because they come from `TABLES` and
 * never from the message.
 */
export class NativeStorageService implements INativeStorageService {
    constructor(
        private readonly logService: ILogService,
        private readonly database: ISqliteDatabase,
        private readonly keyValueStorage: IKeyValueStorage
    ) {}

    public async summarize(): Promise<OnFetchNativeStorageSummaryPayload> {
        // One table at a time: each read is a full scan on the connection the live cache reads share,
        // and ten of them at once would queue every web cache read behind all ten.
        const sqlite: NativeStorageEntry[] = [];
        for (const table of CACHE_TABLES) sqlite.push(await this.summarizeTable(table));
        const mmkv = this.keyValueStorage
            .getAllKeys()
            .sort()
            .map(key => ({ name: key, count: 1, bytes: this.keyValueStorage.getByteLength(key) }));
        return { sqlite, mmkv, unrecoverableTables: [...UNRECOVERABLE_TABLES], keptTables: [...KEPT_TABLES] };
    }

    public async clearCache({ includeInvitedClouds }: { includeInvitedClouds: boolean }) {
        const result: OnClearNativeCachePayload = { cleared: [], kept: [], failed: [] };
        for (const table of CACHE_TABLES) {
            if (KEPT_TABLES.includes(table) || (!includeInvitedClouds && UNRECOVERABLE_TABLES.includes(table))) {
                result.kept.push(table);
                continue;
            }
            // One table at a time and not one batch: a table a failed migration never created must
            // not roll back the clears that did work.
            try {
                await this.database.execute(`DELETE FROM ${table}`);
                result.cleared.push(table);
            } catch (e) {
                this.logService.error('STORAGE', `Clear error for table: ${table}`, e as Error);
                result.failed.push(table);
            }
        }
        this.logService.info('STORAGE', `Native cache cleared: ${result.cleared.join(', ') || 'nothing'}`);
        return result;
    }

    private async summarizeTable(table: string): Promise<NativeStorageEntry> {
        try {
            // Every column, not a known `data` column: the tables do not share one shape
            // (test_records keeps `value`), and a size that skipped a column would undercount.
            const info = await this.database.execute(`PRAGMA table_info(${table})`);
            const columns = (info.rows ?? []).map(row => String((row as { name: unknown }).name));
            if (columns.length === 0) return { name: table, count: 0, bytes: 0, missing: true };

            const length = columns.map(column => `IFNULL(LENGTH("${column}"), 0)`).join(' + ');
            const res = await this.database.execute(
                `SELECT COUNT(*) AS count, IFNULL(SUM(${length}), 0) AS bytes FROM ${table}`
            );
            const row = (res.rows?.[0] ?? {}) as { count?: unknown; bytes?: unknown };
            return { name: table, count: Number(row.count ?? 0), bytes: Number(row.bytes ?? 0) };
        } catch (e) {
            this.logService.error('STORAGE', `Summarize error for table: ${table}`, e as Error);
            return { name: table, count: 0, bytes: 0, error: (e as Error).message };
        }
    }
}
