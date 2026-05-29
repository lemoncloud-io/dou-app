import type { IAppBridgeHost } from '@chatic/bridges';
import type { RequestFileUploadPayload } from '@chatic/app-messages';
import type { IUploadService } from '../../services';
import type { ILogService } from '../../services';

import { createUploadHandlers } from './useUploadHandler';

jest.mock('react-native', () => ({
    AppState: {
        addEventListener: jest.fn(),
    },
}));

jest.mock('../../hooks/useServices', () => ({
    useServices: jest.fn(),
}));

const createBridgeMock = (): IAppBridgeHost =>
    ({
        registerHandler: jest.fn(),
        unregisterHandler: jest.fn(),
        pushEvent: jest.fn(),
        handleMessage: jest.fn(),
    }) as any;

const createLoggerMock = (): ILogService =>
    ({
        subscribe: jest.fn(),
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    }) as any;

const createUploadServiceMock = (): jest.Mocked<IUploadService> =>
    ({
        uploadFile: jest.fn().mockResolvedValue(undefined),
        pauseUpload: jest.fn(),
        resumeUpload: jest.fn(),
        cancelUpload: jest.fn(),
        listRecoverableUploads: jest.fn().mockResolvedValue([]),
    }) as any;

describe('createUploadHandlers (recovery messages)', () => {
    const payload: RequestFileUploadPayload = {
        uploadId: 'u1',
        fileUri: 'file:///tmp/a.bin',
        fileName: 'a.bin',
        fileSize: 10,
        mimeType: 'application/octet-stream',
        uploadUrl: 'https://example.com/upload',
    };

    it('ListRecoverableUploads는 OnListRecoverableUploads로 tasks를 반환해야 한다', async () => {
        const bridge = createBridgeMock();
        const logger = createLoggerMock();
        const uploadService = createUploadServiceMock();

        (uploadService.listRecoverableUploads as jest.Mock).mockResolvedValueOnce([
            {
                uploadId: 'u1',
                status: 'paused',
                payload,
                uploadedBytes: 5,
                lastChunkIndex: 1,
                retryCount: 0,
                createdAt: 1,
                updatedAt: 1,
            },
        ]);

        const handlers = createUploadHandlers(bridge, uploadService, logger);
        const res = await handlers.handleListRecoverableUploads();

        expect(res.success).toBe(true);
        expect(res.type).toBe('OnListRecoverableUploads');
        expect((res as any).data.tasks).toHaveLength(1);
    });

    it('RecoverUpload은 task가 없으면 NOT_FOUND 에러를 반환해야 한다', async () => {
        const bridge = createBridgeMock();
        const logger = createLoggerMock();
        const uploadService = createUploadServiceMock();

        (uploadService.listRecoverableUploads as jest.Mock).mockResolvedValueOnce([]);

        const handlers = createUploadHandlers(bridge, uploadService, logger);
        const res = await handlers.handleRecoverUpload({ type: 'RecoverUpload', data: { uploadId: 'u1' } } as any);

        expect(res.success).toBe(false);
        expect(res.type).toBe('OnRecoverUpload');
        expect((res as any).error.code).toBe('NOT_FOUND');
    });

    it('RecoverUpload은 payload로 uploadService.uploadFile을 호출해야 한다', async () => {
        const bridge = createBridgeMock();
        const logger = createLoggerMock();
        const uploadService = createUploadServiceMock();

        (uploadService.listRecoverableUploads as jest.Mock).mockResolvedValueOnce([
            {
                uploadId: 'u1',
                status: 'paused',
                payload,
                uploadedBytes: 5,
                lastChunkIndex: 1,
                retryCount: 0,
                createdAt: 1,
                updatedAt: 1,
            },
        ]);

        const handlers = createUploadHandlers(bridge, uploadService, logger);
        const res = await handlers.handleRecoverUpload({ type: 'RecoverUpload', data: { uploadId: 'u1' } } as any);

        expect(res.success).toBe(true);
        expect(uploadService.uploadFile).toHaveBeenCalled();
        expect((uploadService.uploadFile as jest.Mock).mock.calls[0][0]).toMatchObject(payload);
    });

    it('RetryUpload도 payload로 uploadService.uploadFile을 호출해야 한다', async () => {
        const bridge = createBridgeMock();
        const logger = createLoggerMock();
        const uploadService = createUploadServiceMock();

        (uploadService.listRecoverableUploads as jest.Mock).mockResolvedValueOnce([
            {
                uploadId: 'u1',
                status: 'failed',
                payload,
                uploadedBytes: 5,
                lastChunkIndex: 1,
                retryCount: 1,
                createdAt: 1,
                updatedAt: 1,
            },
        ]);

        const handlers = createUploadHandlers(bridge, uploadService, logger);
        const res = await handlers.handleRetryUpload({ type: 'RetryUpload', data: { uploadId: 'u1' } } as any);

        expect(res.success).toBe(true);
        expect(uploadService.uploadFile).toHaveBeenCalled();
    });
});
