import type { ProductSubscription, Purchase } from 'react-native-iap';

export type PageLanguage = 'ko' | 'en' | 'cn' | 'jp' | 'vn' | 'id' | 'th';

export type Env = 'local' | 'stage' | 'prod';

export type Platform = 'ios' | 'aos' | 'windows' | 'macos' | 'web';

export type AppLogLevel = 'debug' | 'info' | 'warn' | 'error';

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
    deviceModel?: string | null;
    lang?: PageLanguage;
}

export interface SafeAreaInfo {
    top: number;
    bottom: number;
    left: number;
    right: number;
}

export interface FcmTokenInfo {
    token: string;
}

/**
 * TODO: notification 스펙에 맞게 확장 필요
 * @author raine@lemoncloud.io
 */
export interface NotificationInfo {
    title?: string;
    body?: string;
    data?: Record<string, any>;
}

/**
 * TODO: 로그 메시지 구조 디자인 필요
 * @author raine@lemoncloud.io
 */
export interface AppLogInfo {
    tag: string;
    message?: string;
    data?: any;
    timestamp?: number;
    level?: AppLogLevel;
    error?: any;
}

export interface ProductSubscriptionInfo {
    products: ProductSubscription[];
}

export interface PurchaseInfo {
    purchases: Purchase[];
}
