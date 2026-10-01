import type { IMediaExportBridge } from '../../bridge';
import type { ILogService } from '../../services';

import {
    createMediaExportHandlers,
    type MediaExportPlatform,
    type StoragePermissionResult,
} from './mediaExportHandlers';

const createLoggerMock = (): jest.Mocked<ILogService> =>
    ({ subscribe: jest.fn(), debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }) as any;

const createMediaExportMock = (): jest.Mocked<IMediaExportBridge> => ({
    saveToPhotoLibrary: jest.fn().mockResolvedValue({ mimeType: 'image/png' }),
    shareFile: jest.fn().mockResolvedValue({ completed: true, activityType: 'com.apple.UIKit.activity.Message' }),
});

const platformOf = (os: string, apiLevel: number, result: StoragePermissionResult = 'granted') =>
    ({
        os,
        apiLevel,
        requestStoragePermission: jest.fn().mockResolvedValue(result),
    }) as jest.Mocked<MediaExportPlatform>;

const message = <T>(type: string, data: T) => ({ type, data }) as any;

const rejection = (code: string | undefined, text = 'boom') => Object.assign(new Error(text), code ? { code } : {});

const uri = 'file:///data/user/0/io.chatic.dou/cache/transfer-download/abc/photo.png';

describe('createMediaExportHandlers', () => {
    let mediaExport: jest.Mocked<IMediaExportBridge>;
    let logger: jest.Mocked<ILogService>;

    beforeEach(() => {
        mediaExport = createMediaExportMock();
        logger = createLoggerMock();
    });

    describe('SaveToPhotoLibrary', () => {
        const save = (platform: MediaExportPlatform) =>
            createMediaExportHandlers(mediaExport, platform, logger).handleSaveToPhotoLibrary(
                message('SaveToPhotoLibrary', { uri })
            );

        it('saves and answers with the type the bytes showed', async () => {
            const reply = await save(platformOf('ios', 0));

            expect(mediaExport.saveToPhotoLibrary).toHaveBeenCalledWith(uri);
            expect(reply).toEqual({ type: 'OnSaveToPhotoLibrary', success: true, data: { mimeType: 'image/png' } });
        });

        it('asks for storage permission on Android below API 29 only', async () => {
            const legacy = platformOf('android', 28);
            const scoped = platformOf('android', 29);
            const ios = platformOf('ios', 0);

            await save(legacy);
            await save(scoped);
            await save(ios);

            expect(legacy.requestStoragePermission).toHaveBeenCalledTimes(1);
            expect(scoped.requestStoragePermission).not.toHaveBeenCalled();
            expect(ios.requestStoragePermission).not.toHaveBeenCalled();
            expect(mediaExport.saveToPhotoLibrary).toHaveBeenCalledTimes(3);
        });

        it('fails with PERMISSION_DENIED that can be asked again after a plain refusal, without calling native', async () => {
            const reply = await save(platformOf('android', 24, 'denied'));

            expect(mediaExport.saveToPhotoLibrary).not.toHaveBeenCalled();
            expect(reply).toEqual({
                type: 'OnSaveToPhotoLibrary',
                success: false,
                error: { code: 'PERMISSION_DENIED', message: expect.any(String), details: { canAskAgain: true } },
            });
        });

        it('marks "never ask again" as settings-only', async () => {
            const reply = await save(platformOf('android', 28, 'never_ask_again'));

            expect(reply.error).toEqual(
                expect.objectContaining({ code: 'PERMISSION_DENIED', details: { canAskAgain: false } })
            );
        });

        it('treats a native PERMISSION_DENIED (iOS denied or restricted) as settings-only', async () => {
            mediaExport.saveToPhotoLibrary.mockRejectedValueOnce(
                rejection('PERMISSION_DENIED', 'photo library access is not granted')
            );

            const reply = await save(platformOf('ios', 0));

            expect(reply).toEqual({
                type: 'OnSaveToPhotoLibrary',
                success: false,
                error: {
                    code: 'PERMISSION_DENIED',
                    message: 'photo library access is not granted',
                    details: { canAskAgain: false },
                },
            });
        });

        it.each(['UNSUPPORTED_TYPE', 'SOURCE', 'INVALID', 'INTERNAL'])(
            'carries the native %s into the envelope',
            async code => {
                mediaExport.saveToPhotoLibrary.mockRejectedValueOnce(rejection(code, 'native said no'));

                const reply = await save(platformOf('android', 34));

                expect(reply).toEqual({
                    type: 'OnSaveToPhotoLibrary',
                    success: false,
                    error: { code, message: 'native said no' },
                });
            }
        );

        it('reports an unknown or missing native code as INTERNAL', async () => {
            mediaExport.saveToPhotoLibrary.mockRejectedValueOnce(rejection('E_UNKNOWN'));
            mediaExport.saveToPhotoLibrary.mockRejectedValueOnce(rejection(undefined));
            const platform = platformOf('ios', 0);

            expect((await save(platform)).error?.code).toBe('INTERNAL');
            expect((await save(platform)).error?.code).toBe('INTERNAL');
        });

        it('fails with INVALID when the uri is missing, without asking for anything', async () => {
            const platform = platformOf('android', 28);
            const reply = await createMediaExportHandlers(mediaExport, platform, logger).handleSaveToPhotoLibrary(
                message('SaveToPhotoLibrary', {})
            );

            expect(reply.error?.code).toBe('INVALID');
            expect(platform.requestStoragePermission).not.toHaveBeenCalled();
            expect(mediaExport.saveToPhotoLibrary).not.toHaveBeenCalled();
        });

        it('never logs the file path', async () => {
            mediaExport.saveToPhotoLibrary.mockRejectedValueOnce(rejection('SOURCE', `cannot read ${uri}`));

            await save(platformOf('ios', 0));

            const logged = [...logger.info.mock.calls, ...logger.warn.mock.calls]
                .map(call => call.join(' '))
                .join('\n');
            expect(logged).toContain('SOURCE');
            expect(logged).not.toContain('transfer-download');
        });
    });

    describe('ShareFile', () => {
        const handlers = () => createMediaExportHandlers(mediaExport, platformOf('ios', 0), logger);

        it('passes the uri and title and answers with what the sheet reported', async () => {
            const reply = await handlers().handleShareFile(message('ShareFile', { uri, title: 'photo.png' }));

            expect(mediaExport.shareFile).toHaveBeenCalledWith(uri, 'photo.png');
            expect(reply).toEqual({
                type: 'OnShareFile',
                success: true,
                data: { completed: true, activityType: 'com.apple.UIKit.activity.Message' },
            });
        });

        it('answers a closed sheet as a success with completed false — it is not a failure', async () => {
            mediaExport.shareFile.mockResolvedValueOnce({ completed: false });

            const reply = await handlers().handleShareFile(message('ShareFile', { uri }));

            expect(reply).toEqual({ type: 'OnShareFile', success: true, data: { completed: false } });
        });

        it('never asks for storage permission, even on old Android', async () => {
            const platform = platformOf('android', 24);

            await createMediaExportHandlers(mediaExport, platform, logger).handleShareFile(
                message('ShareFile', { uri })
            );

            expect(platform.requestStoragePermission).not.toHaveBeenCalled();
            expect(mediaExport.shareFile).toHaveBeenCalledWith(uri, undefined);
        });

        it('carries a native failure into the envelope', async () => {
            mediaExport.shareFile.mockRejectedValueOnce(rejection('INVALID', 'outside the download folder'));

            const reply = await handlers().handleShareFile(message('ShareFile', { uri: 'file:///data/app.db' }));

            expect(reply).toEqual({
                type: 'OnShareFile',
                success: false,
                error: { code: 'INVALID', message: 'outside the download folder' },
            });
        });

        it('fails with INVALID when the uri is missing', async () => {
            const reply = await handlers().handleShareFile(message('ShareFile', { uri: '' }));

            expect(reply.error?.code).toBe('INVALID');
            expect(mediaExport.shareFile).not.toHaveBeenCalled();
        });
    });
});
