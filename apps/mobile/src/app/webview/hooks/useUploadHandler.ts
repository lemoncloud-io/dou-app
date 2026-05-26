import { useCallback } from 'react';
import { useServices } from '../../hooks';
import type { IAppBridgeHost } from '@chatic/bridges';
import type { WebMessageData } from '@chatic/app-messages';

export const useUploadHandler = (bridge: IAppBridgeHost) => {
    const { uploadService, logService: logger } = useServices();

    const handleRequestFileUpload = useCallback(
        async (message: WebMessageData<'RequestFileUpload'>) => {
            const payload = message.data;
            const { uploadId } = payload;

            logger.info('UPLOAD', `[${uploadId}] Web requested file upload for ${payload.fileName}`);

            try {
                // Trigger non-blocking async upload loop
                void uploadService.uploadFile(
                    payload,
                    progress => {
                        logger.info(
                            'UPLOAD',
                            `[${uploadId}] Progress: ${(progress.progress * 100).toFixed(1)}% (${progress.status})`
                        );
                        // Push event to WebView
                        bridge.pushEvent<`OnUploadProgress`>({
                            type: 'OnUploadProgress',
                            success: true,
                            data: progress,
                        });
                    },
                    complete => {
                        logger.info('UPLOAD', `[${uploadId}] Complete - Success: ${complete.success}`);
                        // Push event to WebView
                        bridge.pushEvent<`OnUploadComplete`>({
                            type: 'OnUploadComplete',
                            success: complete.success,
                            data: complete,
                        });
                    },
                    cancelledUploadId => {
                        logger.info(
                            'UPLOAD',
                            `[${cancelledUploadId}] Upload successfully cancelled callback triggered`
                        );
                    }
                );

                return {
                    type: 'OnUploadProgress' as const, // return initial progress payload or standard success acknowledgement
                    success: true,
                };
            } catch (e: any) {
                logger.error('UPLOAD', `[${uploadId}] Failed to start upload`, e);
                return {
                    type: 'OnUploadComplete' as const,
                    success: false,
                    error: { code: 'UPLOAD_INIT_FAILED', message: e.message },
                };
            }
        },
        [uploadService, bridge, logger]
    );

    const handlePauseFileUpload = useCallback(
        async (message: WebMessageData<'PauseFileUpload'>) => {
            const { uploadId } = message.data;
            logger.info('UPLOAD', `[${uploadId}] Web requested pause`);
            try {
                uploadService.pauseUpload(uploadId);
                return { success: true };
            } catch (e: any) {
                logger.error('UPLOAD', `[${uploadId}] Pause error`, e);
                return { success: false, error: { code: 'PAUSE_ERROR', message: e.message } };
            }
        },
        [uploadService, logger]
    );

    const handleResumeFileUpload = useCallback(
        async (message: WebMessageData<'ResumeFileUpload'>) => {
            const { uploadId } = message.data;
            logger.info('UPLOAD', `[${uploadId}] Web requested resume`);
            try {
                uploadService.resumeUpload(uploadId);
                return { success: true };
            } catch (e: any) {
                logger.error('UPLOAD', `[${uploadId}] Resume error`, e);
                return { success: false, error: { code: 'RESUME_ERROR', message: e.message } };
            }
        },
        [uploadService, logger]
    );

    const handleCancelFileUpload = useCallback(
        async (message: WebMessageData<'CancelFileUpload'>) => {
            const { uploadId } = message.data;
            logger.info('UPLOAD', `[${uploadId}] Web requested cancel`);
            try {
                uploadService.cancelUpload(uploadId);
                return { success: true };
            } catch (e: any) {
                logger.error('UPLOAD', `[${uploadId}] Cancel error`, e);
                return { success: false, error: { code: 'CANCEL_ERROR', message: e.message } };
            }
        },
        [uploadService, logger]
    );

    return {
        handleRequestFileUpload,
        handlePauseFileUpload,
        handleResumeFileUpload,
        handleCancelFileUpload,
    };
};
