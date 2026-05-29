import type { OnUploadCompletePayload, OnUploadProgressPayload, RequestFileUploadPayload } from '@chatic/app-messages';
import type { UploadTaskPersistedRecord } from './repository';

export interface UploadTaskState {
    payload: RequestFileUploadPayload;
    status: 'uploading' | 'paused' | 'cancelled' | 'completed' | 'failed';
    uploadedBytes: number;
    lastChunkIndex: number;
    onProgress: (progress: OnUploadProgressPayload) => void;
    onComplete: (complete: OnUploadCompletePayload) => void;
    onCancel: (uploadId: string) => void;
}

export interface IUploadService {
    /**
     * Starts uploading a file. Enqueues the upload natively using the UploadManagerBridge.
     */
    uploadFile(
        payload: RequestFileUploadPayload,
        onProgress: (progress: OnUploadProgressPayload) => void,
        onComplete: (complete: OnUploadCompletePayload) => void,
        onCancel: (uploadId: string) => void
    ): Promise<void>;

    /**
     * Pauses the upload natively.
     */
    pauseUpload(uploadId: string): void;

    /**
     * Resumes the upload natively.
     */
    resumeUpload(uploadId: string): void;

    /**
     * Cancels the upload completely natively and performs cleanup.
     */
    cancelUpload(uploadId: string): void;

    /**
     * Loads tasks that can be manually recovered after app restart.
     * Note: persisted "uploading" tasks are treated as "paused" on load.
     */
    listRecoverableUploads(): Promise<UploadTaskPersistedRecord[]>;
}

export interface UploadRetryPolicy {
    /**
     * Maximum number of retry attempts that can be triggered by the caller/UI.
     * This does not automatically retry by itself; it is meant to be used by recovery UX and future auto-retry.
     */
    maxAttempts: number;
}

export interface UploadConcurrencyPolicy {
    /**
     * Maximum number of concurrent uploads allowed in this process.
     * Use `Infinity` to keep legacy "no limit" behavior.
     */
    maxConcurrentUploads: number;
}

export interface UploadPolicy {
    concurrency: UploadConcurrencyPolicy;
    retry: UploadRetryPolicy;
}

export const DEFAULT_UPLOAD_POLICY: UploadPolicy = {
    // Default to a small number to avoid battery/thermal spikes while still enabling parallel uploads.
    // This is configurable by consumers later (UI setting / injected policy).
    concurrency: { maxConcurrentUploads: 3 },
    retry: { maxAttempts: 3 },
};
