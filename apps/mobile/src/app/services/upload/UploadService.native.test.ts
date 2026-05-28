import type { RequestFileUploadPayload } from '@chatic/app-messages';
import type { ILogService } from '../log';
import type { IUploadTaskDataSource } from './repository';
import { UploadService } from './UploadService';
import { UploadManagerBridge } from '../../bridge';

jest.mock('react-native', () => ({
    NativeEventEmitter: class {},
    NativeModules: {},
}));

jest.mock('../../bridge', () => {
    let listener: ((event: any) => void) | null = null;
    return {
        FileManagerBridge: {
            exists: jest.fn(),
            readChunk: jest.fn(),
            startBackgroundTask: jest.fn(),
            endBackgroundTask: jest.fn(),
        },
        UploadManagerBridge: {
            enqueueUpload: jest.fn().mockResolvedValue({ uploadId: 'u1', status: 'uploading', fileSize: 10 }),
            pauseUpload: jest.fn().mockResolvedValue(undefined),
            resumeUpload: jest.fn().mockResolvedValue(undefined),
            cancelUpload: jest.fn().mockResolvedValue(undefined),
            events: {
                addListener: (_name: string, cb: (event: any) => void) => {
                    listener = cb;
                    return { remove: () => (listener = null) };
                },
                __emit: (event: any) => listener?.(event),
            },
        },
    };
});

const createLoggerMock = (): ILogService =>
    ({
        subscribe: jest.fn(),
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    }) as any;

const createDataSourceMock = (): jest.Mocked<IUploadTaskDataSource> =>
    ({
        upsert: jest.fn().mockResolvedValue(undefined),
        updateProgress: jest.fn().mockResolvedValue(undefined),
        incrementRetryCount: jest.fn().mockResolvedValue(0),
        find: jest.fn().mockResolvedValue(null),
        listRecoverable: jest.fn().mockResolvedValue([]),
        delete: jest.fn().mockResolvedValue(undefined),
    }) as any;

describe('UploadService (native path)', () => {
    it('native events should drive onProgress and onComplete', async () => {
        const logger = createLoggerMock();
        const dataSource = createDataSourceMock();
        const svc = new UploadService(logger, dataSource);

        const payload: RequestFileUploadPayload = {
            uploadId: 'u1',
            fileUri: 'file:///tmp/a.bin',
            fileName: 'a.bin',
            fileSize: 10,
            mimeType: 'application/octet-stream',
            uploadUrl: 'https://example.com/upload',
            chunkSize: 5,
        };

        const onProgress = jest.fn();
        const onComplete = jest.fn();
        const onCancel = jest.fn();

        await svc.uploadFile(payload, onProgress, onComplete, onCancel);
        expect(UploadManagerBridge.enqueueUpload as jest.Mock).toHaveBeenCalled();

        // Simulate progress event
        (UploadManagerBridge.events as any).__emit({
            uploadId: 'u1',
            status: 'uploading',
            progress: 0.5,
            uploadedBytes: 5,
            totalBytes: 10,
            lastChunkIndex: 1,
            retryAttempt: 0,
        });

        expect(onProgress).toHaveBeenCalled();

        // Simulate completion event
        (UploadManagerBridge.events as any).__emit({
            uploadId: 'u1',
            status: 'completed',
            progress: 1,
            uploadedBytes: 10,
            totalBytes: 10,
            lastChunkIndex: 2,
            retryAttempt: 0,
        });

        // allow async handler to flush
        await new Promise(r => setTimeout(r, 0));

        expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ uploadId: 'u1', success: true }));
        expect(dataSource.delete).toHaveBeenCalledWith('u1');
    });
});
