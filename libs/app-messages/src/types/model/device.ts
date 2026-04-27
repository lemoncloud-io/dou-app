import type { Platform } from './common';

export type PageLanguage = 'ko' | 'en' | 'cn' | 'jp' | 'vn' | 'id' | 'th';
export type Env = 'local' | 'stage' | 'prod';

/** 앱 및 웹 버전 정보 */
export interface VersionInfo {
    currentVersion: string; // 현재 통합 버전
    latestVersion: string; // 서버 최신 버전
    shouldUpdate: boolean; // 업데이트 강제 여부
    appVersion: string; // 네이티브 빌드 버전
    webVersion: string; // 번들링된 웹 버전
}

/** 디바이스 고유 정보 */
export interface DeviceInfo {
    stage: Env;
    platform: Platform;
    application: string; // 앱 패키지명/번들ID
    deviceToken?: string; // 푸시용 토큰 (FCM/APNS)
    deviceId?: string | null;
    deviceModel?: string | null;
    installId?: string | null;
    lang?: PageLanguage;
}

/** 디스플레이 안전 영역 (노치, 홈바 대응) */
export interface SafeAreaInfo {
    top: number;
    bottom: number;
    left: number;
    right: number;
}

/** [응답] 디바이스/버전 정보 업데이트 페이로드 */
export interface OnUpdateDeviceInfoPayload extends DeviceInfo, VersionInfo {}

/** [응답] 세이프 에어리어 정보 반환 페이로드 */
export interface OnFetchSafeAreaPayload extends SafeAreaInfo {}
