export type DeviceType = 'ios' | 'android' | 'desktop';

export type DeepLinkState = 'initial' | 'launching' | 'store' | 'desktop';

export interface DeepLinkInfo {
    fullPath: string;
    deepLinkUrl: string;
}
