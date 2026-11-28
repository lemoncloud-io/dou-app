import type { PushPort } from '@chatic/ports';

import type { DesktopShellBridge } from './bridge';
import { desktopShellNotificationFeed } from './notificationFeed';

export const desktopShellPush =
    (bridge: DesktopShellBridge) =>
    (base: Pick<PushPort, 'kind'>): PushPort => ({
        ...base,
        notifications: { onReceive: listener => desktopShellNotificationFeed(bridge)(listener) },
        deviceToken: {
            fetch: async () => (await bridge.request({ type: 'FetchFcmToken', data: {} })).data?.token ?? null,
        },
        tokenRenewal: {
            onRenew: listener =>
                bridge.onEvent('OnFetchFcmToken', () => {
                    listener();
                }),
        },
        localBanner: {
            present: banner => {
                void bridge.request({ type: 'ShowNotification', data: banner }).catch(() => undefined);
            },
        },
    });
