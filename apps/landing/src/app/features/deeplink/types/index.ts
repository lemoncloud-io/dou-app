export type DeviceType = 'ios' | 'android' | 'desktop';

export type DeepLinkState = 'initial' | 'launching' | 'desktop' | 'web-redirecting';

export type DialogType = 'app-confirm' | 'store-confirm' | null;

export interface DeepLinkInfo {
    fullPath: string;
    deepLinkUrl: string;
}
