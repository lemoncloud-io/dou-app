import type { OnNotificationPayload, ShowNotificationPayload } from '@chatic/bridge-messages';

import type { ShellOrBrowser } from './ports';

export interface PushPort {
    readonly kind: ShellOrBrowser;
    readonly notifications: NotificationFeed | null;
    readonly deviceToken: DeviceTokenSource | null;
    readonly tokenRenewal: DeviceTokenRenewal | null;
    readonly localBanner: LocalBanner | null;
}

export interface NotificationFeed {
    onReceive(listener: (payload: OnNotificationPayload) => void): () => void;
}

export interface DeviceTokenSource {
    fetch(): Promise<string | null>;
}

export interface DeviceTokenRenewal {
    onRenew(listener: () => void): () => void;
}

export interface LocalBanner {
    present(banner: ShowNotificationPayload): void;
}
