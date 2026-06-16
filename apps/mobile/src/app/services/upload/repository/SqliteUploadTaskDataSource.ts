import type { ISqliteDatabase } from '../../../database';
import { TABLES } from '../../../database/sqlite/tables';
import type { ILogService } from '../../log';
import type {
    IUploadTaskDataSource,
    UploadTaskPersistedRecord,
    UploadTaskProgressUpdateInput,
    UploadTaskUpsertInput,
} from './types';

export class SqliteUploadTaskDataSource implements IUploadTaskDataSource {
    constructor(
        private readonly sqliteDatabase: ISqliteDatabase,
        private readonly logService: ILogService
    ) {}

    public async upsert(input: UploadTaskUpsertInput): Promise<void> {
        const now = input.now ?? Date.now();
        const payloadJson = JSON.stringify(input.payload);
        const serverSessionJson = input.serverSession ? JSON.stringify(input.serverSession) : null;

        await this.sqliteDatabase.execute(
            `INSERT OR REPLACE INTO ${TABLES.UPLOAD_TASKS} (
                upload_id, status, payload, file_uri, file_name, mime_type, total_bytes, chunk_size,
                uploaded_bytes, last_chunk_index, retry_count, server_session, auth_ref,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM ${TABLES.UPLOAD_TASKS} WHERE upload_id = ?), ?), ?);`,
            [
                input.uploadId,
                input.status,
                payloadJson,
                input.payload.fileUri,
                input.payload.fileName,
                input.payload.mimeType,
                input.payload.fileSize,
                input.payload.chunkSize ?? null,
                input.uploadedBytes,
                input.lastChunkIndex,
                input.retryCount ?? 0,
                serverSessionJson,
                input.authRef ?? null,
                input.uploadId,
                now,
                now,
            ]
        );
    }

    public async updateProgress(input: UploadTaskProgressUpdateInput): Promise<void> {
        const now = input.now ?? Date.now();
        const serverSessionJson = input.serverSession ? JSON.stringify(input.serverSession) : null;

        await this.sqliteDatabase.execute(
            `UPDATE ${TABLES.UPLOAD_TASKS}
             SET status = ?,
                 uploaded_bytes = ?,
                 last_chunk_index = ?,
                 server_session = COALESCE(?, server_session),
                 updated_at = ?
             WHERE upload_id = ?;`,
            [input.status, input.uploadedBytes, input.lastChunkIndex, serverSessionJson, now, input.uploadId]
        );
    }

    public async incrementRetryCount(uploadId: string, now: number = Date.now()): Promise<number> {
        await this.sqliteDatabase.execute(
            `UPDATE ${TABLES.UPLOAD_TASKS}
             SET retry_count = retry_count + 1,
                 updated_at = ?
             WHERE upload_id = ?;`,
            [now, uploadId]
        );

        const row = await this.sqliteDatabase.execute(
            `SELECT retry_count AS retryCount FROM ${TABLES.UPLOAD_TASKS} WHERE upload_id = ? LIMIT 1;`,
            [uploadId]
        );
        const retryCount = Number((row.rows?.[0] as any)?.retryCount ?? 0);
        return retryCount;
    }

    public async find(uploadId: string): Promise<UploadTaskPersistedRecord | null> {
        const result = await this.sqliteDatabase.execute(
            `SELECT
                upload_id AS uploadId,
                status,
                payload,
                uploaded_bytes AS uploadedBytes,
                last_chunk_index AS lastChunkIndex,
                retry_count AS retryCount,
                server_session AS serverSession,
                auth_ref AS authRef,
                created_at AS createdAt,
                updated_at AS updatedAt
             FROM ${TABLES.UPLOAD_TASKS}
             WHERE upload_id = ?
             LIMIT 1;`,
            [uploadId]
        );

        const row = (result.rows?.[0] as any) ?? null;
        if (!row) return null;

        return {
            uploadId: String(row.uploadId),
            status: row.status,
            payload: JSON.parse(String(row.payload)),
            uploadedBytes: Number(row.uploadedBytes ?? 0),
            lastChunkIndex: Number(row.lastChunkIndex ?? 0),
            retryCount: Number(row.retryCount ?? 0),
            serverSession: row.serverSession ? JSON.parse(String(row.serverSession)) : undefined,
            authRef: row.authRef ?? null,
            createdAt: Number(row.createdAt ?? 0),
            updatedAt: Number(row.updatedAt ?? 0),
        };
    }

    public async listRecoverable(): Promise<UploadTaskPersistedRecord[]> {
        const result = await this.sqliteDatabase.execute(
            `SELECT
                upload_id AS uploadId,
                status,
                payload,
                uploaded_bytes AS uploadedBytes,
                last_chunk_index AS lastChunkIndex,
                retry_count AS retryCount,
                server_session AS serverSession,
                auth_ref AS authRef,
                created_at AS createdAt,
                updated_at AS updatedAt
             FROM ${TABLES.UPLOAD_TASKS}
             WHERE status IN ('uploading', 'paused', 'failed')
             ORDER BY updated_at DESC;`
        );

        const rows = (result.rows as any[]) ?? [];
        return rows
            .map(row => {
                try {
                    // If the app was killed while uploading, we cannot guarantee the native/JS loop is still running.
                    // For manual recovery UX, we downgrade persisted `uploading` to `paused` on load.
                    return {
                        uploadId: String(row.uploadId),
                        status: row.status === 'uploading' ? 'paused' : row.status,
                        payload: JSON.parse(String(row.payload)),
                        uploadedBytes: Number(row.uploadedBytes ?? 0),
                        lastChunkIndex: Number(row.lastChunkIndex ?? 0),
                        retryCount: Number(row.retryCount ?? 0),
                        serverSession: row.serverSession ? JSON.parse(String(row.serverSession)) : undefined,
                        authRef: row.authRef ?? null,
                        createdAt: Number(row.createdAt ?? 0),
                        updatedAt: Number(row.updatedAt ?? 0),
                    } as UploadTaskPersistedRecord;
                } catch (e) {
                    this.logService.warn('UPLOAD', `[DataSource] Failed to parse persisted upload task: ${String(e)}`);
                    return null;
                }
            })
            .filter(Boolean) as UploadTaskPersistedRecord[];
    }

    public async delete(uploadId: string): Promise<void> {
        await this.sqliteDatabase.execute(`DELETE FROM ${TABLES.UPLOAD_TASKS} WHERE upload_id = ?;`, [uploadId]);
    }
}
