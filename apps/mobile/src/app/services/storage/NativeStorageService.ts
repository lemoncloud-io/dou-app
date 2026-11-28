import type {
    NativeStorageEntry,
    OnClearNativeCachePayload,
    OnFetchNativeStorageSummaryPayload,
} from '@chatic/bridge-messages';

import type { IKeyValueStorage } from '@chatic/storage-mmkv';

import type { ISqliteDatabase } from '@chatic/db-sqlite';
import { TABLES } from '@chatic/db-sqlite';
import type { ILogService } from '../log';

const UNRECOVERABLE_TABLES: readonly string[] = [TABLES.INVITE_CLOUDS];

const KEPT_TABLES: readonly string[] = [TABLES.INVITES];

const CACHE_TABLES: readonly string[] = Object.values(TABLES);

export const VAULT_SUMMARY_NAME = 'vault:nativeSecure';

export interface INativeStorageService {
    summarize(): Promise<OnFetchNativeStorageSummaryPayload>;
    clearCache(options: { includeInvitedClouds: boolean }): Promise<OnClearNativeCachePayload>;
}

export class NativeStorageService implements INativeStorageService {
    constructor(
        private readonly logService: ILogService,
        private readonly database: ISqliteDatabase,
        private readonly keyValueStorage: IKeyValueStorage,
        private readonly vaultKeyCount: () => number | null = () => null
    ) {}

    public async summarize(): Promise<OnFetchNativeStorageSummaryPayload> {
        const sqlite: NativeStorageEntry[] = [];
        for (const table of CACHE_TABLES) sqlite.push(await this.summarizeTable(table));
        const mmkv = this.keyValueStorage
            .getAllKeys()
            .sort()
            .map(
                (key): NativeStorageEntry => ({ name: key, count: 1, bytes: this.keyValueStorage.getByteLength(key) })
            );
        mmkv.push(this.summarizeVault());
        return { sqlite, mmkv, unrecoverableTables: [...UNRECOVERABLE_TABLES], keptTables: [...KEPT_TABLES] };
    }

    public async clearCache({ includeInvitedClouds }: { includeInvitedClouds: boolean }) {
        const result: OnClearNativeCachePayload = { cleared: [], kept: [], failed: [] };
        for (const table of CACHE_TABLES) {
            if (KEPT_TABLES.includes(table) || (!includeInvitedClouds && UNRECOVERABLE_TABLES.includes(table))) {
                result.kept.push(table);
                continue;
            }
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

    private summarizeVault(): NativeStorageEntry {
        const count = this.vaultKeyCount();
        return count === null
            ? { name: VAULT_SUMMARY_NAME, count: 0, bytes: 0, error: 'unavailable' }
            : { name: VAULT_SUMMARY_NAME, count, bytes: 0 };
    }

    private async summarizeTable(table: string): Promise<NativeStorageEntry> {
        try {
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
