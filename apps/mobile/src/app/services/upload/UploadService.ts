import { UploadManagerBridge } from '../../bridge';
import type { UploadManagerStateChangedEvent } from '../../bridge/UploadManagerBridge';
import type { ILogService } from '../log';
import type { OnUploadCompletePayload, OnUploadProgressPayload, RequestFileUploadPayload } from '@chatic/app-messages';
import type { IUploadService, UploadTaskState } from './types';
import type { IUploadTaskDataSource } from './repository';

/**
 * TODO: To be changed payload
 * @author raine@lemoncloud.io
 */
export class UploadService implements IUploadService {
    private tasks = new Map<string, UploadTaskState>();
    private nativeEventSubscription: { remove: () => void } | null = null;

    constructor(
        private readonly logger: ILogService,
        private readonly uploadTaskDataSource: IUploadTaskDataSource
    ) {
        this.ensureNativeEventSubscription();
    }

    private ensureNativeEventSubscription() {
        if (this.nativeEventSubscription) return;

        if (UploadManagerBridge.events) {
            this.nativeEventSubscription = UploadManagerBridge.events.addListener(
                'UploadManagerStateChanged',
                (event: UploadManagerStateChangedEvent) => {
                    void this.handleNativeEvent(event);
                }
            );
        }
    }

    private async handleNativeEvent(event: UploadManagerStateChangedEvent) {
        const uploadId = event.uploadId;
        if (!uploadId) return;

        const task = this.tasks.get(uploadId);
        if (!task) return;

        const statusRaw = event.status ?? 'uploading';
        const normalizedStatus = statusRaw === 'queued' ? 'uploading' : (statusRaw as UploadTaskState['status']);

        const totalBytes = event.totalBytes ?? task.payload.fileSize;
        const uploadedBytes = event.uploadedBytes ?? task.uploadedBytes ?? 0;
        const lastChunkIndex = event.lastChunkIndex ?? task.lastChunkIndex;
        const progress =
            event.progress != null
                ? event.progress
                : totalBytes > 0
                  ? Math.min(1, Math.max(0, uploadedBytes / totalBytes))
                  : 0;
        const retryAttempt = event.retryAttempt ?? 0;

        task.status = normalizedStatus;
        task.uploadedBytes = uploadedBytes;
        task.lastChunkIndex = lastChunkIndex;

        task.onProgress({
            uploadId,
            progress: normalizedStatus === 'completed' ? 1 : progress,
            uploadedBytes,
            totalBytes,
            status: normalizedStatus,
        });

        if (retryAttempt > 0) {
            this.logger.info('UPLOAD', `[${uploadId}] Native retry attempt: ${retryAttempt}`);
        }

        await this.uploadTaskDataSource
            .updateProgress({
                uploadId,
                status: normalizedStatus,
                uploadedBytes,
                lastChunkIndex,
            })
            .catch(err => this.logger.warn('UPLOAD', `[${uploadId}] Failed to persist native progress`, err));

        if (normalizedStatus === 'completed') {
            task.onComplete({ uploadId, success: true, response: 'Native upload completed.' });
            this.tasks.delete(uploadId);
            await this.uploadTaskDataSource
                .delete(uploadId)
                .catch(err =>
                    this.logger.warn('UPLOAD', `[${uploadId}] Failed to delete persisted task on completion`, err)
                );
        } else if (normalizedStatus === 'failed') {
            const message = String(event?.errorMessage ?? 'Native upload failed');
            task.onComplete({ uploadId, success: false, error: { code: 'UPLOAD_FAILED', message } });
        } else if (normalizedStatus === 'cancelled') {
            try {
                task.onCancel(uploadId);
            } finally {
                this.tasks.delete(uploadId);
                await this.uploadTaskDataSource
                    .delete(uploadId)
                    .catch(err =>
                        this.logger.warn('UPLOAD', `[${uploadId}] Failed to delete persisted task on cancel`, err)
                    );
            }
        }
    }

    /**
     * Returns persisted tasks that can be manually recovered after app restart.
     *
     * Note:
     * - Persisted tasks in `uploading` state are downgraded to `paused` by the repository.
     * - This method is intentionally "read-only" and does not start uploads.
     */
    public listRecoverableUploads() {
        return this.uploadTaskDataSource.listRecoverable();
    }

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

        // Recover from persisted state if present (manual recovery after app restart).
        // This allows the web layer / debug screens to restart uploads with the same uploadId and continue from offset.
        const persisted = await this.uploadTaskDataSource.find(uploadId).catch(err => {
            this.logger.warn('UPLOAD', `[${uploadId}] Failed to load persisted upload task`, err);
            return null;
        });

        // Only recover offsets when we are sure it matches the same file payload.
        // If the caller accidentally reuses the same uploadId for a different file, we should not "resume" from a stale offset.
        const isSameFile =
            persisted?.payload?.fileUri === payload.fileUri &&
            persisted?.payload?.fileName === payload.fileName &&
            persisted?.payload?.fileSize === payload.fileSize &&
            persisted?.payload?.mimeType === payload.mimeType;

        const recoveredUploadedBytes =
            isSameFile &&
            persisted &&
            (persisted.status === 'paused' || persisted.status === 'failed' || persisted.status === 'uploading')
                ? persisted.uploadedBytes
                : 0;
        const recoveredLastChunkIndex =
            isSameFile &&
            persisted &&
            (persisted.status === 'paused' || persisted.status === 'failed' || persisted.status === 'uploading')
                ? persisted.lastChunkIndex
                : 0;

        this.ensureNativeEventSubscription();

        // Initialize new task state
        const taskState: UploadTaskState = {
            payload,
            status: 'uploading',
            uploadedBytes: recoveredUploadedBytes,
            lastChunkIndex: recoveredLastChunkIndex,
            onProgress,
            onComplete,
            onCancel,
        };

        this.tasks.set(uploadId, taskState);

        // Persist initial task snapshot for recovery
        void this.uploadTaskDataSource
            .upsert({
                uploadId,
                status: 'uploading',
                payload,
                uploadedBytes: taskState.uploadedBytes,
                lastChunkIndex: taskState.lastChunkIndex,
                retryCount: isSameFile ? (persisted?.retryCount ?? 0) : 0,
                authRef: isSameFile ? (persisted?.authRef ?? null) : null,
                serverSession: isSameFile ? persisted?.serverSession : undefined,
            })
            .catch(err => this.logger.warn('UPLOAD', `[${uploadId}] Failed to persist upload task`, err));

        const nativePayload: any = {
            ...payload,
            uploadedBytes: taskState.uploadedBytes,
            lastChunkIndex: taskState.lastChunkIndex,
        };

        try {
            await UploadManagerBridge.enqueueUpload(nativePayload);
        } catch (e: any) {
            taskState.onComplete({
                uploadId,
                success: false,
                error: { code: 'UPLOAD_INIT_FAILED', message: e.message ?? 'Native enqueue failed' },
            });
            void this.uploadTaskDataSource
                .updateProgress({
                    uploadId,
                    status: 'failed',
                    uploadedBytes: taskState.uploadedBytes,
                    lastChunkIndex: taskState.lastChunkIndex,
                })
                .catch(err => this.logger.warn('UPLOAD', `[${uploadId}] Failed to persist native init failure`, err));
        }
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
        void UploadManagerBridge.pauseUpload(uploadId).catch(err => {
            this.logger.error('UPLOAD', `[${uploadId}] Native pause failed`, err);
        });

        // Notify progress update for paused state
        task.onProgress({
            uploadId,
            progress: task.uploadedBytes / task.payload.fileSize,
            uploadedBytes: task.uploadedBytes,
            totalBytes: task.payload.fileSize,
            status: 'paused',
        });

        void this.uploadTaskDataSource
            .updateProgress({
                uploadId,
                status: 'paused',
                uploadedBytes: task.uploadedBytes,
                lastChunkIndex: task.lastChunkIndex,
            })
            .catch(err => this.logger.warn('UPLOAD', `[${uploadId}] Failed to persist paused state`, err));
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
        void UploadManagerBridge.resumeUpload(uploadId).catch(err => {
            this.logger.error('UPLOAD', `[${uploadId}] Native resume failed`, err);
        });

        // Notify progress update for resuming (uploading) state
        task.onProgress({
            uploadId,
            progress: task.uploadedBytes / task.payload.fileSize,
            uploadedBytes: task.uploadedBytes,
            totalBytes: task.payload.fileSize,
            status: 'uploading',
        });

        void this.uploadTaskDataSource
            .updateProgress({
                uploadId,
                status: 'uploading',
                uploadedBytes: task.uploadedBytes,
                lastChunkIndex: task.lastChunkIndex,
            })
            .catch(err => this.logger.warn('UPLOAD', `[${uploadId}] Failed to persist resumed state`, err));
    }

    public cancelUpload(uploadId: string): void {
        const task = this.tasks.get(uploadId);
        if (!task) {
            this.logger.warn('UPLOAD', `[${uploadId}] Cannot cancel, task not found`);
            return;
        }

        this.logger.info('UPLOAD', `[${uploadId}] Cancelling upload`);
        task.status = 'cancelled';
        void UploadManagerBridge.cancelUpload(uploadId).catch(err => {
            this.logger.error('UPLOAD', `[${uploadId}] Native cancel failed`, err);
        });

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

        // Remove persisted task as well (cancelled tasks are not recoverable)
        void this.uploadTaskDataSource
            .delete(uploadId)
            .catch(err => this.logger.warn('UPLOAD', `[${uploadId}] Failed to delete persisted task`, err));
    }
}
