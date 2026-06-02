import type { IAppBridgeHost } from '@chatic/bridges';
import type { RecoverableUploadTaskInfo, RequestFileUploadPayload, WebMessageAppHandler } from '@chatic/app-messages';
import { useMemo } from 'react';
import { useServices } from '../../hooks';

export const useUploadHandler = (bridge: IAppBridgeHost) => {
    const { uploadService, logService: logger } = useServices();

    return useMemo(() => {
        const startUploadForPayload = async (payload: RequestFileUploadPayload) => {
            const { uploadId } = payload;
            void uploadService.uploadFile(
                payload,
                progress => {
                    logger.info(
                        'UPLOAD',
                        `[${uploadId}] Progress: ${(progress.progress * 100).toFixed(1)}% (${progress.status})`
                    );
                    bridge.pushEvent({
                        type: 'OnUploadProgress',
                        success: true,
                        data: progress,
                    });
                },
                complete => {
                    logger.info('UPLOAD', `[${uploadId}] Complete - Success: ${complete.success}`);
                    bridge.pushEvent({
                        type: 'OnUploadComplete',
                        success: complete.success,
                        data: complete,
                    });
                },
                cancelledUploadId => {
                    logger.info('UPLOAD', `[${cancelledUploadId}] Upload cancelled callback triggered`);
                }
            );
        };

        const handleRequestFileUpload: WebMessageAppHandler<'RequestFileUpload'> = async message => {
            const payload = message.data;
            const { uploadId } = payload;

            logger.info('UPLOAD', `[${uploadId}] Web requested file upload for ${payload.fileName}`);

            try {
                await startUploadForPayload(payload);
                return {
                    type: 'OnRequestFileUpload' as const,
                    success: true,
                    data: { uploadId, success: true },
                };
            } catch (e: any) {
                logger.error('UPLOAD', `[${uploadId}] Failed to start upload`, e);
                return {
                    type: 'OnRequestFileUpload' as const,
                    success: false,
                    error: { code: 'UPLOAD_INIT_FAILED', message: e.message },
                };
            }
        };

        const handlePauseFileUpload: WebMessageAppHandler<'PauseFileUpload'> = async message => {
            const { uploadId } = message.data;
            logger.info('UPLOAD', `[${uploadId}] Web requested pause`);
            try {
                uploadService.pauseUpload(uploadId);
                return {
                    type: 'OnPauseFileUpload' as const,
                    success: true,
                    data: { uploadId, success: true },
                };
            } catch (e: any) {
                logger.error('UPLOAD', `[${uploadId}] Pause error`, e);
                return {
                    type: 'OnPauseFileUpload' as const,
                    success: false,
                    error: { code: 'PAUSE_ERROR', message: e.message },
                };
            }
        };

        const handleResumeFileUpload: WebMessageAppHandler<'ResumeFileUpload'> = async message => {
            const { uploadId } = message.data;
            logger.info('UPLOAD', `[${uploadId}] Web requested resume`);
            try {
                uploadService.resumeUpload(uploadId);
                return {
                    type: 'OnResumeFileUpload' as const,
                    success: true,
                    data: { uploadId, success: true },
                };
            } catch (e: any) {
                logger.error('UPLOAD', `[${uploadId}] Resume error`, e);
                return {
                    type: 'OnResumeFileUpload' as const,
                    success: false,
                    error: { code: 'RESUME_ERROR', message: e.message },
                };
            }
        };

        const handleCancelFileUpload: WebMessageAppHandler<'CancelFileUpload'> = async message => {
            const { uploadId } = message.data;
            logger.info('UPLOAD', `[${uploadId}] Web requested cancel`);
            try {
                uploadService.cancelUpload(uploadId);
                return {
                    type: 'OnCancelFileUpload' as const,
                    success: true,
                    data: { uploadId, success: true },
                };
            } catch (e: any) {
                logger.error('UPLOAD', `[${uploadId}] Cancel error`, e);
                return {
                    type: 'OnCancelFileUpload' as const,
                    success: false,
                    error: { code: 'CANCEL_ERROR', message: e.message },
                };
            }
        };

        const handleListRecoverableUploads: WebMessageAppHandler<'ListRecoverableUploads'> = async () => {
            try {
                const tasks = (await uploadService.listRecoverableUploads()) as unknown as RecoverableUploadTaskInfo[];
                return { type: 'OnListRecoverableUploads' as const, success: true, data: { tasks } };
            } catch (e: any) {
                logger.error('UPLOAD', `[Recovery] ListRecoverableUploads error`, e);
                return {
                    type: 'OnListRecoverableUploads' as const,
                    success: false,
                    error: { code: 'RECOVERY_LIST_ERROR', message: e.message },
                };
            }
        };

        const handleRecoverUpload: WebMessageAppHandler<'RecoverUpload'> = async message => {
            const { uploadId } = message.data;
            logger.info('UPLOAD', `[${uploadId}] Web requested recover`);

            try {
                const tasks = await uploadService.listRecoverableUploads();
                const target = tasks.find(t => t.uploadId === uploadId);
                if (!target) {
                    return {
                        type: 'OnRecoverUpload' as const,
                        success: false,
                        error: { code: 'NOT_FOUND', message: `Recoverable upload task not found: ${uploadId}` },
                    };
                }

                await startUploadForPayload(target.payload);
                return { type: 'OnRecoverUpload' as const, success: true, data: {} };
            } catch (e: any) {
                logger.error('UPLOAD', `[${uploadId}] Recover error`, e);
                return {
                    type: 'OnRecoverUpload' as const,
                    success: false,
                    error: { code: 'RECOVER_ERROR', message: e.message },
                };
            }
        };

        const handleRetryUpload: WebMessageAppHandler<'RetryUpload'> = async message => {
            const { uploadId } = message.data;
            logger.info('UPLOAD', `[${uploadId}] Web requested retry`);

            try {
                const tasks = await uploadService.listRecoverableUploads();
                const target = tasks.find(t => t.uploadId === uploadId);
                if (!target) {
                    return {
                        type: 'OnRetryUpload' as const,
                        success: false,
                        error: { code: 'NOT_FOUND', message: `Recoverable upload task not found: ${uploadId}` },
                    };
                }

                await startUploadForPayload(target.payload);
                return { type: 'OnRetryUpload' as const, success: true, data: {} };
            } catch (e: any) {
                logger.error('UPLOAD', `[${uploadId}] Retry error`, e);
                return {
                    type: 'OnRetryUpload' as const,
                    success: false,
                    error: { code: 'RETRY_ERROR', message: e.message },
                };
            }
        };

        return {
            handleRequestFileUpload,
            handlePauseFileUpload,
            handleResumeFileUpload,
            handleCancelFileUpload,
            handleListRecoverableUploads,
            handleRecoverUpload,
            handleRetryUpload,
        };
    }, [bridge, uploadService, logger]);
};
