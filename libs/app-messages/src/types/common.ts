import type { ProductSubscription, Purchase } from 'react-native-iap';

export type PageLanguage = 'ko' | 'en' | 'cn' | 'jp' | 'vn' | 'id' | 'th';
export type Env = 'local' | 'stage' | 'prod';
export type Platform = 'ios' | 'aos' | 'windows' | 'macos' | 'web';

/**
 * 앱 로그 레벨
 */
export type AppLogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * 앱 버전 정보
 */
export interface VersionInfo {
    currentVersion: string;
    latestVersion: string;
    shouldUpdate: boolean;
}

/**
 * 디바이스 정보
 */
export interface DeviceInfo {
    stage: Env;
    platform: Platform;
    application: string;
    deviceToken?: string;
    deviceId?: string | null;
    deviceModel?: string | null;
    lang?: PageLanguage;
}

/**
 * Safe Area 정보 (노치, 홈 인디케이터 등)
 */
export interface SafeAreaInfo {
    top: number;
    bottom: number;
    left: number;
    right: number;
}

/**
 * FCM 토큰 정보
 */
export interface FcmTokenInfo {
    token: string;
}

/**
 * 알림 정보
 * TODO: notification 스펙에 맞게 확장 필요
 * @author raine@lemoncloud.io
 */
export interface NotificationInfo {
    title?: string;
    body?: string;
    data?: Record<string, any>;
}

/**
 * 앱 로그 정보
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

/**
 * 인앱 결제 구독 상품 정보
 */
export interface ProductSubscriptionInfo {
    products: ProductSubscription[];
}

/**
 * 인앱 결제 구매 내역 정보
 */
export interface PurchaseInfo {
    purchases: Purchase[];
}

/**
 * 미디어 에셋 정보 (이미지, 비디오 등)
 */
export interface MediaAsset {
    uri?: string;
    fileName?: string;
    type?: string;
    width?: number;
    height?: number;
    fileSize?: number;
    base64?: string;
}

/**
 * 이메일 주소 정보
 */
export interface EmailAddress {
    label: string;
    email: string;
}

/**
 * 전화번호 정보
 */
export interface PhoneNumber {
    label: string;
    number: string;
}

/**
 * 주소 정보
 */
export interface PostalAddress {
    label: string;
    formattedAddress: string;
    street: string;
    pobox: string;
    neighborhood: string;
    city: string;
    region: string;
    state: string;
    postCode: string;
    country: string;
}

/**
 * 생일 정보
 */
export interface Birthday {
    day: number;
    month: number;
    year: number;
}

/**
 * 메신저 주소 정보
 */
export interface InstantMessageAddress {
    username: string;
    service: string;
}

/**
 * URL 주소 정보
 */
export interface UrlAddress {
    label: string;
    url: string;
}

/**
 * 연락처 정보
 */
export interface ContactInfo {
    recordID: string;
    backTitle: string;
    company: string | null;
    emailAddresses: EmailAddress[];
    displayName: string;
    familyName: string;
    givenName: string;
    middleName: string;
    jobTitle: string;
    phoneNumbers: PhoneNumber[];
    hasThumbnail: boolean;
    thumbnailPath: string;
    isStarred: boolean;
    postalAddresses: PostalAddress[];
    prefix: string;
    suffix: string;
    department: string;
    birthday?: Birthday;
    imAddresses: InstantMessageAddress[];
    urlAddresses: UrlAddress[];
    note: string;
}

/**
 * 문서 정보
 */
export interface DocumentInfo {
    uri: string;
    name?: string | null;
    type?: string | null;
    size?: number | null;
    base64?: string;
}

/**
 * 캐시 데이터 타입
 * TODO: (주의) 업데이트 될 수 있음
 * @author raine@lemoncloud.io
 */
export type CacheType = 'channel' | 'chat' | 'user' | 'join';
