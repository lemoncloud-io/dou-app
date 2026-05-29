import { NativeEventEmitter, NativeModules } from 'react-native';

/**
 * UploadManager native module exposed by Android (UploadManagerModule) and iOS (UploadManager).
 * This module manages background file transfers natively, escaping JS single-thread bottlenecks.
 */
const { UploadManager } = NativeModules;

if (!UploadManager) {
    console.warn(
        'UploadManager native module is not registered. This is expected until Android/iOS native scaffolding is compiled.'
    );
}

/**
 * Standard upload states propagated from the native OS upload engines.
 */
export type UploadManagerState = 'queued' | 'uploading' | 'paused' | 'cancelled' | 'completed' | 'failed';

/**
 * Parameters required to enqueue a new high-performance background chunk upload task.
 *
 * NOTE: Defined locally to decouple the native module bridge from web message models (@chatic/app-messages).
 * Keeping the bridge independent prevents index bundle size increases and dependency circularities.
 */
export interface UploadEnqueueInput {
    /** Unique task identifier (uuid) */
    uploadId: string;
    /** Native document filepath (file:// or staging sandbox uri) */
    fileUri: string;
    /** Output file name on S3 / endpoint */
    fileName: string;
    /** Total byte length of the target file */
    fileSize: number;
    /** Target file mimetype (e.g. application/octet-stream) */
    mimeType: string;
    /** Destination HTTP server endpoint for receiving chunk posts */
    uploadUrl: string;
    /** Max byte length per chunk post (default 1MB) */
    chunkSize?: number;
    /** Optional authentication or metadata HTTP headers */
    headers?: Record<string, string>;
    /** Current offset to resume from (non-zero if recovered from SQLite) */
    uploadedBytes?: number;
    /** Last successfully transferred chunk index to resume from */
    lastChunkIndex?: number;
}

/**
 * Native background broadcast event format received when state changes.
 */
export interface UploadManagerStateChangedEvent {
    /** Target task identifier */
    uploadId: string;
    /** New execution status */
    status: UploadManagerState;
    /** Relative progress factor (0.0 to 1.0) */
    progress?: number;
    /** Total bytes successfully sent so far */
    uploadedBytes?: number;
    /** Expected total byte length of the file */
    totalBytes?: number;
    /** Last completed chunk index */
    lastChunkIndex?: number;
    /** Current native auto-retry cycle index */
    retryAttempt?: number;
    /** Native stack-trace error explanation on failure */
    errorMessage?: string;
}

/**
 * JS-to-Native UploadManager Module Interface contract.
 */
export interface IUploadManagerBridge {
    /** Register and launch a new background upload worker thread */
    enqueueUpload(
        payload: UploadEnqueueInput
    ): Promise<{ uploadId: string; status: UploadManagerState; fileSize: number }>;
    /** Freeze background transmission natively */
    pauseUpload(uploadId: string): Promise<void>;
    /** Resume paused background transmission natively */
    resumeUpload(uploadId: string): Promise<void>;
    /** Abort background worker thread and erase native cache directories */
    cancelUpload(uploadId: string): Promise<void>;
    /** Event emitter receiver channel for 'UploadManagerStateChanged' native events */
    events: NativeEventEmitter | null;
}

/**
 * Singleton implementation of the Native Upload Bridge.
 */
export const UploadManagerBridge: IUploadManagerBridge = {
    enqueueUpload: async (payload: UploadEnqueueInput) => {
        if (!UploadManager) throw new Error('UploadManager native module is not available');
        return UploadManager.enqueueUpload(payload);
    },
    pauseUpload: async (uploadId: string) => {
        if (!UploadManager) throw new Error('UploadManager native module is not available');
        return UploadManager.pauseUpload(uploadId);
    },
    resumeUpload: async (uploadId: string) => {
        if (!UploadManager) throw new Error('UploadManager native module is not available');
        return UploadManager.resumeUpload(uploadId);
    },
    cancelUpload: async (uploadId: string) => {
        if (!UploadManager) throw new Error('UploadManager native module is not available');
        return UploadManager.cancelUpload(uploadId);
    },
    events: UploadManager ? new NativeEventEmitter(UploadManager) : null,
};
