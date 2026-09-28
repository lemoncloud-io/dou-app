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

// --- Test File Types ---

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
