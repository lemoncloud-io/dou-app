import type { RequestFileUploadPayload } from '@chatic/app-messages';

export type UploadTaskStatus = 'uploading' | 'paused' | 'cancelled' | 'completed' | 'failed';

export interface UploadTaskPersistedRecord {
    uploadId: string;
    status: UploadTaskStatus;
    payload: RequestFileUploadPayload;
    uploadedBytes: number;
    lastChunkIndex: number;
    retryCount: number;
    serverSession?: unknown;
    authRef?: string | null;
    createdAt: number;
    updatedAt: number;
}

export interface UploadTaskUpsertInput {
    uploadId: string;
    status: UploadTaskStatus;
    payload: RequestFileUploadPayload;
    uploadedBytes: number;
    lastChunkIndex: number;
    retryCount?: number;
    serverSession?: unknown;
    authRef?: string | null;
    now?: number;
}

export interface UploadTaskProgressUpdateInput {
    uploadId: string;
    status: UploadTaskStatus;
    uploadedBytes: number;
    lastChunkIndex: number;
    serverSession?: unknown;
    now?: number;
}

export interface IUploadTaskDataSource {
    upsert(input: UploadTaskUpsertInput): Promise<void>;
    updateProgress(input: UploadTaskProgressUpdateInput): Promise<void>;
    incrementRetryCount(uploadId: string, now?: number): Promise<number>;
    find(uploadId: string): Promise<UploadTaskPersistedRecord | null>;
    listRecoverable(): Promise<UploadTaskPersistedRecord[]>;
    delete(uploadId: string): Promise<void>;
}
