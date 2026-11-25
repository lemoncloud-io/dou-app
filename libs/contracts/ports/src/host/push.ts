import type { ShellOrBrowser } from './ports';

export type NotificationContent = {
    title?: string;
    body?: string;
    data?: Record<string, any>;
};

export type ReceivedNotification = {
    notification: NotificationContent;
};

export type LocalBannerRequest = {
    title: string;
    body: string;
    channelId?: string;
    deeplink?: string;
};

export interface PushPort {
    readonly kind: ShellOrBrowser;
    readonly notifications: NotificationFeed | null;
    readonly deviceToken: DeviceTokenSource | null;
    readonly tokenRenewal: DeviceTokenRenewal | null;
    readonly localBanner: LocalBanner | null;
}

export interface NotificationFeed {
    onReceive(listener: (payload: ReceivedNotification) => void): () => void;
}

export interface DeviceTokenSource {
    fetch(): Promise<string | null>;
}

export interface DeviceTokenRenewal {
    onRenew(listener: () => void): () => void;
}

export interface LocalBanner {
    present(banner: LocalBannerRequest): void;
}
