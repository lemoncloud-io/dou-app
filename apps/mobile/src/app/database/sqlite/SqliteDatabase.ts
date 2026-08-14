import type { Scalar, SQLBatchTuple, QueryResult, BatchQueryResult, DB } from '@op-engineering/op-sqlite';
import { open } from '@op-engineering/op-sqlite';
import type { ISqliteDatabase } from '../types';
import type { ILogService } from '../../services/log';
import { MIGRATIONS, TARGET_VERSION } from './schema';

export class SqliteDatabase implements ISqliteDatabase {
    private readonly db: DB;
    private readonly logService: ILogService;
    // Kicked off eagerly so every query below waits for migrations to land, regardless of
    // whether/when a caller also invokes initTables() directly — a fresh install has no tables
    // until this resolves, and a query racing ahead of it fails with "no such table: X".
    private readonly ready: Promise<void>;

    constructor(logService: ILogService) {
        this.logService = logService;
        this.db = open({ name: 'dou.sqlite' });
        this.ready = this.initTables();
    }

    public async initTables(): Promise<void> {
        try {
            await this.db.transaction(async tx => {
                const versionResult = await tx.execute('PRAGMA user_version');
                const currentVersion = (versionResult.rows?.[0] as any)?.user_version || 0;

                if (currentVersion < TARGET_VERSION) {
                    this.logService.info('SQLITE', `Starting Migration: v${currentVersion} -> v${TARGET_VERSION}`);

                    for (let v = currentVersion; v < TARGET_VERSION; v++) {
                        const scripts = MIGRATIONS[v];
                        if (scripts) {
                            for (const sql of scripts) {
                                await tx.execute(sql);
                            }
                            this.logService.info('SQLITE', `Step v${v} applied.`);
                        }
                    }

                    await tx.execute(`PRAGMA user_version = ${TARGET_VERSION}`);
                    this.logService.info('SQLITE', `Database is now at v${TARGET_VERSION}`);
                }
            });
        } catch (error) {
            this.logService.error('SQLITE', 'Migration failed:', error as Error);
        }
    }

    /**
     * The version migrations actually REACHED, not `TARGET_VERSION`. `execute` waits on `ready`, so
     * this reads the DB after migrations have run (or failed and rolled back) — which is what makes
     * it an honest input to the handshake's per-domain contract report (ADR-0053).
     */
    public async getSchemaVersion(): Promise<number> {
        const result = await this.execute('PRAGMA user_version');
        const version = (result.rows?.[0] as any)?.user_version;
        // Throw rather than coerce a missing value to 0: version 0 is a real answer (a DB whose
        // migrations never ran), so silently returning it for an unreadable PRAGMA would report
        // "this app persists nothing" as if it were measured. The caller has a fallback for a
        // failure and none for a confident wrong answer.
        if (typeof version !== 'number') {
            throw new Error('PRAGMA user_version returned no numeric value');
        }
        return version;
    }

    public async execute(query: string, params?: Scalar[]): Promise<QueryResult> {
        await this.ready;
        return this.db.execute(query, params);
    }

    public async executeBatch(commands: SQLBatchTuple[]): Promise<BatchQueryResult> {
        await this.ready;
        return this.db.executeBatch(commands);
    }

    public async backup(destFilePath: string): Promise<void> {
        try {
            await this.ready;
            const safePath = destFilePath.replace(/'/g, "''");
            await this.db.execute(`VACUUM INTO '${safePath}'`);
            this.logService.info('SQLITE', `Database backed up successfully to ${destFilePath}`);
        } catch (error) {
            this.logService.error('SQLITE', `Backup failed to ${destFilePath}`, error as Error);
            throw error;
        }
    }

    public async restore(sourceFilePath: string): Promise<void> {
        try {
            await this.ready;
            const safePath = sourceFilePath.replace(/'/g, "''");
            await this.db.execute(`ATTACH DATABASE '${safePath}' AS backup_db`);

            await this.db.transaction(async tx => {
                const result = await tx.execute(
                    `SELECT name FROM backup_db.sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`
                );

                const tables = (result.rows || []) as { name: string }[];

                for (const { name: tableName } of tables) {
                    const mainInfo = await tx.execute(`PRAGMA main.table_info(${tableName})`);
                    const backupInfo = await tx.execute(`PRAGMA backup_db.table_info(${tableName})`);

                    const mainCols = (mainInfo.rows || []).map(c => c.name as string);
                    const backupCols = (backupInfo.rows || []).map(c => c.name as string);

                    const sharedCols = mainCols.filter(c => backupCols.includes(c)).join(', ');
                    if (!sharedCols) continue;

                    await tx.execute(`DELETE FROM main.${tableName}`);
                    await tx.execute(
                        `INSERT INTO main.${tableName} (${sharedCols}) SELECT ${sharedCols} FROM backup_db.${tableName}`
                    );
                }
            });

            await this.db.execute('DETACH DATABASE backup_db');
            this.logService.info('SQLITE', `Database restored successfully from: ${sourceFilePath}`);
        } catch (error) {
            this.logService.error('SQLITE', `Restore failed from ${sourceFilePath}`, error as Error);
            try {
                await this.db.execute('DETACH DATABASE backup_db');
            } catch (e) {
                this.logService.error('SQLITE', `Detach database failed`, e as Error);
            }
            throw error;
        }
    }

    public close(): void {
        this.db.close();
    }
}
