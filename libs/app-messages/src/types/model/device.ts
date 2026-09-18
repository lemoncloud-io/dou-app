import type { Platform } from './common';

export type PageLanguage = 'ko' | 'en' | 'cn' | 'jp' | 'vn' | 'id' | 'th';
export type Env = 'local' | 'stage' | 'prod';

/** App and web version info */
export type VersionInfo = {
    currentVersion: string; // Current combined version
    latestVersion: string; // Latest version on the server
    shouldUpdate: boolean; // Whether an update is forced
    appVersion: string; // Native build version
    webVersion: string; // Bundled web version
};

/** Device-unique info */
export type DeviceInfo = {
    stage: Env;
    platform: Platform;
    application: string; // App package name / bundle ID
    deviceToken?: string; // Push token (FCM/APNS)
    /** @deprecated Composite `deviceId:firebaseInstallId`; use `uniqueDeviceId` + `firebaseInstallationId`. */
    deviceId?: string | null;
    deviceModel?: string | null;
    /** @deprecated Carries the bare device id despite the name; use `uniqueDeviceId`. */
    installId?: string | null;
    /** Bare unique device id, stable across app reinstalls. */
    uniqueDeviceId?: string | null;
    /** Firebase installation id; changes on app reinstall. */
    firebaseInstallationId?: string | null;
    lang?: PageLanguage;
};

/** Display safe area (accounts for notch, home bar) */
export type SafeAreaInfo = {
    top: number;
    bottom: number;
    left: number;
    right: number;
};

/** [Response] Device/version info update payload */
export type OnUpdateDeviceInfoPayload = DeviceInfo & VersionInfo;

/** [Response] Safe area info return payload */
export type OnFetchSafeAreaPayload = SafeAreaInfo;

// --- File Upload Types ---

/** [Request] File upload request payload */
export type RequestFileUploadPayload = {
    uploadId: string; // Unique upload identifier (generated as a UUID on the web side, then control is handed to native)
    fileUri: string; // On-device temporary file URI (obtained from DocumentPicker/ImagePicker)
    fileName: string; // File name
    fileSize: number; // Total file size (bytes)
    mimeType: string; // File MIME type
    uploadUrl: string; // Target API endpoint URL for the upload
    chunkSize?: number; // Chunk size for split transfer (default: 1MB = 1,048,576 bytes)
    headers?: Record<string, string>; // Custom headers such as auth tokens
};

export default RequestFileUploadPayload;

/** [Request] Pause file upload payload */
export type PauseFileUploadPayload = {
    uploadId: string;
};

/** [Request] Resume file upload payload */
export type ResumeFileUploadPayload = {
    uploadId: string;
};

/** [Request] Cancel file upload payload */
export type CancelFileUploadPayload = {
    uploadId: string;
};

/**
 * [Request] Fetch the list of manually recoverable upload tasks
 */
export type ListRecoverableUploadsPayload = {
    // Empty object type, reserved for future extension (optional fields, etc.).
};

/** [Request] Trigger manual recovery (resume) of an upload task */
export type RecoverUploadPayload = {
    uploadId: string;
};

/** [Request] Trigger retry of an upload task */
export type RetryUploadPayload = {
    uploadId: string;
};

/** [Request] Create a dummy sparse file for testing */
export type CreateDummyFilePayload = {
    sizeInBytes: number;
    fileName: string;
};

/** [Response] Result of creating a dummy sparse file for testing */
export type OnCreateDummyFilePayload = {
    uri: string; // file:// URI of the created file
    name: string; // File name
    size: number; // Requested file size (bytes)
};

export type RecoverableUploadTaskStatus = 'uploading' | 'paused' | 'failed' | 'cancelled' | 'completed';

/**
 * [Response] Info for a manually recoverable upload task
 */
export type RecoverableUploadTaskInfo = {
    uploadId: string;
    status: RecoverableUploadTaskStatus;
    payload: RequestFileUploadPayload;
    uploadedBytes: number;
    lastChunkIndex: number;
    retryCount: number;
    serverSession?: unknown;
    authRef?: string | null;
    createdAt: number;
    updatedAt: number;
};

/** [Response] Returns the list of manually recoverable upload tasks */
export type OnListRecoverableUploadsPayload = {
    tasks: RecoverableUploadTaskInfo[];
};

/** [Response - Event] File upload progress payload */
export type OnUploadProgressPayload = {
    uploadId: string;
    progress: number; // Fraction between 0 and 1 (progress ratio)
    uploadedBytes: number; // Cumulative bytes uploaded so far
    totalBytes: number; // Total file size in bytes
    status: 'uploading' | 'paused' | 'cancelled' | 'completed' | 'failed';
};

/** [Response - Event] File upload completion payload */
export type OnUploadCompletePayload = {
    uploadId: string;
    success: boolean;
    response?: string; // Server response text on successful upload
    error?: {
        code: string;
        message: string;
    };
};

/** [Request] Contacts lookup request payload */
export type GetContactsPayload = {
    // Empty object type, reserved for future extension (optional fields, etc.).
};

/** [Request] Safe area lookup request payload */
export type FetchSafeAreaPayload = {
    // Empty object type, reserved for future extension (optional fields, etc.).
};

/** [Request] Background status lookup request payload */
export type FetchBackgroundStatusPayload = {
    // Empty object type, reserved for future extension (optional fields, etc.).
};

/** [Request] App icon info lookup request payload */
export type FetchAppIconPayload = {
    // Empty object type, reserved for future extension (optional fields, etc.).
};

/** [Request] App icon list lookup request payload */
export type FetchAppIconListPayload = {
    // Empty object type, reserved for future extension (optional fields, etc.).
};
