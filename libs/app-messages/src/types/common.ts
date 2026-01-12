export type PageLanguage = 'ko' | 'en' | 'cn' | 'jp' | 'vn' | 'id' | 'th';

export type Env = 'local' | 'stage' | 'prod';

export type Platform = 'ios' | 'aos' | 'windows' | 'macos' | 'web';

export interface VersionInfo {
    currentVersion: string;
    latestVersion: string;
    shouldUpdate: boolean;
}

export interface DeviceInfo {
    stage: Env;
    platform: Platform;
    application: string;
    deviceToken?: string;
    deviceId?: string | null;
    lang?: PageLanguage;
}
