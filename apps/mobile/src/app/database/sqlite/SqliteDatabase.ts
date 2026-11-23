import type { Scalar, SQLBatchTuple, QueryResult, BatchQueryResult, DB } from '@op-engineering/op-sqlite';
import { open } from '@op-engineering/op-sqlite';
import type { ISqliteDatabase } from '../types';
import type { ILogService } from '../../services/log';
import { MIGRATIONS, TARGET_VERSION } from './schema';

export class SqliteDatabase implements ISqliteDatabase {
    private readonly db: DB;
    private readonly logService: ILogService;
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

    public async getSchemaVersion(): Promise<number> {
        const result = await this.execute('PRAGMA user_version');
        const version = (result.rows?.[0] as any)?.user_version;
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

    public close(): void {
        this.db.close();
    }
}
