import { FileManagerBridge } from '../../bridge';
import type { ILogService } from '../log';
import type { OnUploadCompletePayload, OnUploadProgressPayload, RequestFileUploadPayload } from '@chatic/app-messages';
import type { IUploadService, UploadTaskState } from './types';

/**
 * TODO: To be changed payload
 * @author raine@lemoncloud.io
 */
export class UploadService implements IUploadService {
    private tasks = new Map<string, UploadTaskState>();

    constructor(private readonly logger: ILogService) {}

    public async uploadFile(
        payload: RequestFileUploadPayload,
        onProgress: (progress: OnUploadProgressPayload) => void,
        onComplete: (complete: OnUploadCompletePayload) => void,
        onCancel: (uploadId: string) => void
    ): Promise<void> {
        const { uploadId } = payload;
        this.logger.info('UPLOAD', `[${uploadId}] Starting upload for ${payload.fileName} (${payload.fileSize} bytes)`);

        // Check if task already exists
        if (this.tasks.has(uploadId)) {
            const existing = this.tasks.get(uploadId)!;
            if (existing.status === 'paused') {
                this.logger.info('UPLOAD', `[${uploadId}] Found existing paused task, resuming instead`);
                // Update callbacks and resume
                existing.onProgress = onProgress;
                existing.onComplete = onComplete;
                existing.onCancel = onCancel;
                this.resumeUpload(uploadId);
                return;
            } else if (existing.status === 'uploading') {
                this.logger.warn('UPLOAD', `[${uploadId}] Task is already uploading`);
                return;
            }
        }

        // Initialize new task state
        const taskState: UploadTaskState = {
            payload,
            status: 'uploading',
            uploadedBytes: 0,
            lastChunkIndex: 0,
            abortController: new AbortController(),
            onProgress,
            onComplete,
            onCancel,
        };

        this.tasks.set(uploadId, taskState);
        void this.startUploadLoop(uploadId);
    }

    public pauseUpload(uploadId: string): void {
        const task = this.tasks.get(uploadId);
        if (!task) {
            this.logger.warn('UPLOAD', `[${uploadId}] Cannot pause, task not found`);
            return;
        }

        if (task.status !== 'uploading') {
            this.logger.warn('UPLOAD', `[${uploadId}] Cannot pause, task is in status: ${task.status}`);
            return;
        }

        this.logger.info('UPLOAD', `[${uploadId}] Pausing upload`);
        task.status = 'paused';
        task.abortController?.abort();

        // Notify progress update for paused state
        task.onProgress({
            uploadId,
            progress: task.uploadedBytes / task.payload.fileSize,
            uploadedBytes: task.uploadedBytes,
            totalBytes: task.payload.fileSize,
            status: 'paused',
        });
    }

    public resumeUpload(uploadId: string): void {
        const task = this.tasks.get(uploadId);
        if (!task) {
            this.logger.warn('UPLOAD', `[${uploadId}] Cannot resume, task not found`);
            return;
        }

        if (task.status !== 'paused' && task.status !== 'failed') {
            this.logger.warn('UPLOAD', `[${uploadId}] Cannot resume, task is in status: ${task.status}`);
            return;
        }

        this.logger.info('UPLOAD', `[${uploadId}] Resuming upload from chunk ${task.lastChunkIndex}`);
        task.status = 'uploading';
        task.abortController = new AbortController();

        // Notify progress update for resuming (uploading) state
        task.onProgress({
            uploadId,
            progress: task.uploadedBytes / task.payload.fileSize,
            uploadedBytes: task.uploadedBytes,
            totalBytes: task.payload.fileSize,
            status: 'uploading',
        });

        void this.startUploadLoop(uploadId);
    }

    public cancelUpload(uploadId: string): void {
        const task = this.tasks.get(uploadId);
        if (!task) {
            this.logger.warn('UPLOAD', `[${uploadId}] Cannot cancel, task not found`);
            return;
        }

        this.logger.info('UPLOAD', `[${uploadId}] Cancelling upload`);
        const previousStatus = task.status;
        task.status = 'cancelled';
        task.abortController?.abort();

        // Notify progress update for cancelled state
        task.onProgress({
            uploadId,
            progress: task.uploadedBytes / task.payload.fileSize,
            uploadedBytes: task.uploadedBytes,
            totalBytes: task.payload.fileSize,
            status: 'cancelled',
        });

        // Trigger the explicit cancel callback
        try {
            task.onCancel(uploadId);
        } catch (callbackErr) {
            this.logger.error('UPLOAD', `[${uploadId}] Error in onCancel callback`, callbackErr);
        }

        // Clean up from the map
        this.tasks.delete(uploadId);
    }

    private async startUploadLoop(uploadId: string): Promise<void> {
        const task = this.tasks.get(uploadId);
        if (!task) return;

        const { payload } = task;
        const chunkSize = payload.chunkSize ?? 1024 * 1024; // Default: 1MB
        const totalBytes = payload.fileSize;
        const totalChunks = Math.ceil(totalBytes / chunkSize);

        try {
            this.logger.info('UPLOAD', `[${uploadId}] Checking file path: ${payload.fileUri}`);
            const exists = await FileManagerBridge.exists(payload.fileUri);
            if (!exists) {
                throw new Error(`File does not exist at path: ${payload.fileUri}`);
            }

            // Start native background task / foreground service
            await FileManagerBridge.startBackgroundTask(uploadId, payload.fileName, 0.0).catch(err => {
                this.logger.error('UPLOAD', `[${uploadId}] Failed to start background task`, err);
            });

            for (let i = task.lastChunkIndex; i < totalChunks; i++) {
                // Safeguard against state changes while we were waiting
                if (task.status !== 'uploading') {
                    this.logger.info('UPLOAD', `[${uploadId}] Upload loop interrupted, task status: ${task.status}`);
                    await FileManagerBridge.endBackgroundTask(uploadId).catch(err => {
                        this.logger.error(
                            'UPLOAD',
                            `[${uploadId}] Failed to end background task on loop interrupt`,
                            err
                        );
                    });
                    return;
                }

                const offset = i * chunkSize;
                const length = Math.min(chunkSize, totalBytes - offset);

                this.logger.info(
                    'UPLOAD',
                    `[${uploadId}] Reading chunk ${i + 1}/${totalChunks} (Offset: ${offset}, Length: ${length})`
                );

                // Read base64 chunk
                const base64Data = await FileManagerBridge.readChunk(payload.fileUri, length, offset);

                // Prepare fetch parameters
                const signal = task.abortController?.signal;
                const headers = {
                    'Content-Type': 'application/json',
                    'X-Upload-ID': uploadId,
                    'X-Chunk-Index': String(i),
                    'X-Total-Chunks': String(totalChunks),
                    'X-Chunk-Offset': String(offset),
                    'X-Chunk-Size': String(length),
                    'X-File-Name': encodeURIComponent(payload.fileName),
                    'X-File-Size': String(totalBytes),
                    ...payload.headers,
                };

                const body = JSON.stringify({
                    uploadId,
                    fileName: payload.fileName,
                    mimeType: payload.mimeType,
                    chunkIndex: i,
                    totalChunks,
                    offset,
                    length,
                    totalBytes,
                    chunkData: base64Data,
                });

                this.logger.info(
                    'UPLOAD',
                    `[${uploadId}] Sending chunk ${i + 1}/${totalChunks} to ${payload.uploadUrl}`
                );

                const response = await fetch(payload.uploadUrl, {
                    method: 'POST',
                    headers,
                    body,
                    signal,
                });

                if (!response.ok) {
                    const responseText = await response.text().catch(() => '');
                    throw new Error(`Server returned status ${response.status}: ${responseText}`);
                }

                const responseText = await response.text();

                // Update task progress
                task.lastChunkIndex = i + 1;
                task.uploadedBytes += length;
                const progress = task.uploadedBytes / totalBytes;

                // Notify progress
                task.onProgress({
                    uploadId,
                    progress,
                    uploadedBytes: task.uploadedBytes,
                    totalBytes,
                    status: 'uploading',
                });

                // Update native background service/task with current progress
                await FileManagerBridge.startBackgroundTask(uploadId, payload.fileName, progress).catch(err => {
                    this.logger.error('UPLOAD', `[${uploadId}] Failed to update background progress`, err);
                });
            }

            // Loop completed successfully!
            this.logger.info('UPLOAD', `[${uploadId}] Upload complete!`);
            task.status = 'completed';

            // Notify final progress (1.0)
            task.onProgress({
                uploadId,
                progress: 1.0,
                uploadedBytes: totalBytes,
                totalBytes,
                status: 'completed',
            });

            // Notify completion
            task.onComplete({
                uploadId,
                success: true,
                response: `Upload successfully completed ${totalChunks} chunks.`,
            });

            // Cleanup task from map
            this.tasks.delete(uploadId);

            // Clean up background task!
            await FileManagerBridge.endBackgroundTask(uploadId).catch(err => {
                this.logger.error('UPLOAD', `[${uploadId}] Failed to end background task on completion`, err);
            });
        } catch (error: any) {
            // If the error was due to an abort operation, handle gracefully
            if (error.name === 'AbortError' || task.status === 'paused' || task.status === 'cancelled') {
                this.logger.info('UPLOAD', `[${uploadId}] Chunk upload aborted due to status: ${task.status}`);
                await FileManagerBridge.endBackgroundTask(uploadId).catch(err => {
                    this.logger.error('UPLOAD', `[${uploadId}] Failed to end background task on abort`, err);
                });
                return;
            }

            this.logger.error('UPLOAD', `[${uploadId}] Upload failed`, error);
            task.status = 'failed';

            task.onProgress({
                uploadId,
                progress: task.uploadedBytes / totalBytes,
                uploadedBytes: task.uploadedBytes,
                totalBytes,
                status: 'failed',
            });

            task.onComplete({
                uploadId,
                success: false,
                error: {
                    code: 'UPLOAD_FAILED',
                    message: error.message || 'An error occurred during chunked file upload',
                },
            });

            // Clean up background task!
            await FileManagerBridge.endBackgroundTask(uploadId).catch(err => {
                this.logger.error('UPLOAD', `[${uploadId}] Failed to end background task on failure`, err);
            });
        }
    }
}
