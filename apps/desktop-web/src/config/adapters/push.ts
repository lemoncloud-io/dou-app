import { webClient } from '@chatic/bridges';
import { pushAdapters } from '@chatic/runtime-web';
import type { PushPort, ShellOrBrowserImplementations } from '@chatic/runtime-web';

import { onDesktopNotification } from './notificationFeed';

export const desktopPush: ShellOrBrowserImplementations<'push'> = {
    shell: (base): PushPort => ({
        ...base,
        notifications: { onReceive: listener => onDesktopNotification(listener) },
        deviceToken: {
            fetch: async () => (await webClient.request({ type: 'FetchFcmToken', data: {} })).data?.token ?? null,
        },
        tokenRenewal: {
            onRenew: listener =>
                webClient.onEvent('OnFetchFcmToken', () => {
                    listener();
                }),
        },
        localBanner: {
            present: banner => {
                void webClient.request({ type: 'ShowNotification', data: banner }).catch(() => undefined);
            },
        },
    }),
    browser: (base): PushPort => ({
        ...base,
        notifications: null,
        deviceToken: null,
        tokenRenewal: null,
        localBanner: null,
    }),
};

export const { host: pushHost, shell: pushShell, browser: pushBrowser } = pushAdapters(desktopPush);
