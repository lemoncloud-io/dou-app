import type { OnUploadCompletePayload, OnUploadProgressPayload, RequestFileUploadPayload } from '@chatic/app-messages';

export interface UploadTaskState {
    payload: RequestFileUploadPayload;
    status: 'uploading' | 'paused' | 'cancelled' | 'completed' | 'failed';
    uploadedBytes: number;
    lastChunkIndex: number;
    abortController?: AbortController;
    onProgress: (progress: OnUploadProgressPayload) => void;
    onComplete: (complete: OnUploadCompletePayload) => void;
    onCancel: (uploadId: string) => void;
}

export interface IUploadService {
    /**
     * Starts uploading a file. Read offset by offset and chunk by chunk using RNFS,
     * post to the specified endpoint, and report progress.
     */
    uploadFile(
        payload: RequestFileUploadPayload,
        onProgress: (progress: OnUploadProgressPayload) => void,
        onComplete: (complete: OnUploadCompletePayload) => void,
        onCancel: (uploadId: string) => void
    ): Promise<void>;

    /**
     * Pauses the upload, keeping track of the state so it can be resumed later.
     */
    pauseUpload(uploadId: string): void;

    /**
     * Resumes the upload from where it was paused.
     */
    resumeUpload(uploadId: string): void;

    /**
     * Cancels the upload completely and performs cleanup.
     */
    cancelUpload(uploadId: string): void;
}
