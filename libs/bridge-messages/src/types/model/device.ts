import type { Platform } from './common';

export type PageLanguage = 'ko' | 'en' | 'cn' | 'jp' | 'vn' | 'id' | 'th';
export type Env = 'local' | 'stage' | 'prod';

export type VersionInfo = {
    currentVersion: string;
    latestVersion: string;
    shouldUpdate: boolean;
    appVersion: string;
    webVersion: string;
};

export type DeviceInfo = {
    stage: Env;
    platform: Platform;
    application: string;
    deviceId?: string | null;
    deviceModel?: string | null;
    installId?: string | null;
    uniqueDeviceId?: string | null;
    firebaseInstallationId?: string | null;
    lang?: PageLanguage;
};

export type OnUpdateDeviceInfoPayload = DeviceInfo & VersionInfo;

export type CreateDummyFilePayload = {
    sizeInBytes: number;
    fileName: string;
};

export type OnCreateDummyFilePayload = {
    uri: string;
    name: string;
    size: number;
};

export type GetContactsPayload = {};

export type FetchAppIconPayload = {};

export type FetchAppIconListPayload = {};

export const USER_AGENT_PREFIX_IOS = 'DOU_IOS';
export const USER_AGENT_PREFIX_ANDROID = 'DOU_ANDROID';
