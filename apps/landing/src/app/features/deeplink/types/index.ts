export type DeviceType = 'ios' | 'android' | 'desktop';

export type DeepLinkState = 'initial' | 'launching' | 'desktop' | 'web-redirecting';

export type DialogType = 'app-confirm' | 'store-confirm' | null;

export interface DeepLinkInfo {
    fullPath: string;
    deepLinkUrl: string;
}

/** Firebase short link invite data */
export interface ShortLinkInvite {
    code: string;
    Location?: string;
    userId?: string;
    channelId?: string;
    name?: string;
    $envs?: {
        backend?: string;
        wss?: string;
    };
}

/** Firebase deferredDeepLinks document */
export interface ShortLinkDocument {
    id: string;
    deepLinkUrl: string;
    shortCode: string;
    invite: ShortLinkInvite;
    displayName?: string;
    createdAt: number;
}
