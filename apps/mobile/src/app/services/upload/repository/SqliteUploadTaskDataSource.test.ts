import type { ISqliteDatabase } from '../../../database/types';
import type { ILogService } from '../../log';
import type { RequestFileUploadPayload } from '@chatic/app-messages';
import { SqliteUploadTaskDataSource } from './SqliteUploadTaskDataSource';

const createSqliteMock = () => {
    const sqliteDatabase: ISqliteDatabase = {
        initTables: jest.fn(),
        execute: jest.fn(),
        executeBatch: jest.fn(),
        backup: jest.fn(),
        restore: jest.fn(),
        close: jest.fn(),
    } as any;

    return sqliteDatabase;
};

const createLoggerMock = (): ILogService =>
    ({
        subscribe: jest.fn(),
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    }) as any;

describe('SqliteUploadTaskDataSource', () => {
    const basePayload: RequestFileUploadPayload = {
        uploadId: 'u1',
        fileUri: 'file:///tmp/a.bin',
        fileName: 'a.bin',
        fileSize: 10,
        mimeType: 'application/octet-stream',
        uploadUrl: 'https://example.com/upload',
        chunkSize: 5,
        headers: { Authorization: 'Bearer token' },
    };

    it('upsert는 upload_tasks에 INSERT OR REPLACE를 실행해야 한다', async () => {
        const sqlite = createSqliteMock();
        const logger = createLoggerMock();
        const dataSource = new SqliteUploadTaskDataSource(sqlite, logger);

        (sqlite.execute as jest.Mock).mockResolvedValueOnce({ rows: [] });

        await dataSource.upsert({
            uploadId: basePayload.uploadId,
            status: 'uploading',
            payload: basePayload,
            uploadedBytes: 3,
            lastChunkIndex: 1,
            retryCount: 2,
            authRef: 'auth-ref',
            serverSession: { sessionId: 's1' },
            now: 123,
        });

        expect(sqlite.execute).toHaveBeenCalledTimes(1);
        const [query, params] = (sqlite.execute as jest.Mock).mock.calls[0];
        expect(String(query)).toContain('INSERT OR REPLACE INTO upload_tasks');
        expect(params[0]).toBe('u1'); // upload_id
        expect(params[1]).toBe('uploading'); // status
        expect(JSON.parse(params[2])).toMatchObject(basePayload); // payload json
    });

    it('find는 payload/serverSession을 JSON으로 파싱하여 반환해야 한다', async () => {
        const sqlite = createSqliteMock();
        const logger = createLoggerMock();
        const dataSource = new SqliteUploadTaskDataSource(sqlite, logger);

        (sqlite.execute as jest.Mock).mockResolvedValueOnce({
            rows: [
                {
                    uploadId: 'u1',
                    status: 'paused',
                    payload: JSON.stringify(basePayload),
                    uploadedBytes: 5,
                    lastChunkIndex: 1,
                    retryCount: 1,
                    serverSession: JSON.stringify({ sessionId: 's1' }),
                    authRef: 'auth-ref',
                    createdAt: 10,
                    updatedAt: 11,
                },
            ],
        });

        const record = await dataSource.find('u1');
        expect(record).not.toBeNull();
        expect(record?.uploadId).toBe('u1');
        expect(record?.payload.fileName).toBe('a.bin');
        expect(record?.serverSession).toEqual({ sessionId: 's1' });
    });

    it('listRecoverable는 persisted uploading을 paused로 강등해야 한다', async () => {
        const sqlite = createSqliteMock();
        const logger = createLoggerMock();
        const dataSource = new SqliteUploadTaskDataSource(sqlite, logger);

        (sqlite.execute as jest.Mock).mockResolvedValueOnce({
            rows: [
                {
                    uploadId: 'u1',
                    status: 'uploading',
                    payload: JSON.stringify(basePayload),
                    uploadedBytes: 5,
                    lastChunkIndex: 1,
                    retryCount: 0,
                    serverSession: null,
                    authRef: null,
                    createdAt: 10,
                    updatedAt: 11,
                },
            ],
        });

        const items = await dataSource.listRecoverable();
        expect(items).toHaveLength(1);
        expect(items[0].status).toBe('paused');
    });

    it('listRecoverable는 파싱 실패 row를 무시하고 warn 로그를 남겨야 한다', async () => {
        const sqlite = createSqliteMock();
        const logger = createLoggerMock();
        const dataSource = new SqliteUploadTaskDataSource(sqlite, logger);

        (sqlite.execute as jest.Mock).mockResolvedValueOnce({
            rows: [
                {
                    uploadId: 'bad',
                    status: 'paused',
                    payload: '{not-json',
                    uploadedBytes: 0,
                    lastChunkIndex: 0,
                    retryCount: 0,
                    serverSession: null,
                    authRef: null,
                    createdAt: 0,
                    updatedAt: 0,
                },
            ],
        });

        const items = await dataSource.listRecoverable();
        expect(items).toHaveLength(0);
        expect(logger.warn).toHaveBeenCalled();
    });

    it('incrementRetryCount는 UPDATE 후 SELECT한 retryCount 값을 반환해야 한다', async () => {
        const sqlite = createSqliteMock();
        const logger = createLoggerMock();
        const dataSource = new SqliteUploadTaskDataSource(sqlite, logger);

        (sqlite.execute as jest.Mock)
            .mockResolvedValueOnce({ rows: [] }) // UPDATE
            .mockResolvedValueOnce({ rows: [{ retryCount: 3 }] }); // SELECT

        const retryCount = await dataSource.incrementRetryCount('u1', 999);
        expect(retryCount).toBe(3);
        expect(sqlite.execute).toHaveBeenCalledTimes(2);
    });
});
