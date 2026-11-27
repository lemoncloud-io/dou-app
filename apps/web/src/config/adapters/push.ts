import { webClient } from '@chatic/bridges';
import { pushAdapters } from '@chatic/runtime-hybrid-web';
import type { PushPort, ShellOrBrowserImplementations } from '@chatic/runtime-hybrid-web';

import { appBridge } from '../../app/bridge/appBridge';

export const webPush: ShellOrBrowserImplementations<'push'> = {
    shell: (base): PushPort => ({
        ...base,
        notifications: {
            onReceive: listener =>
                webClient.onEvent('OnReceiveNotification', message => {
                    const payload = message.data;
                    if (!payload) return;
                    listener(payload);
                }),
        },
        deviceToken: { fetch: async () => (await appBridge.fetchFcmToken())?.data?.token ?? null },
        tokenRenewal: null,
        localBanner: null,
    }),
    browser: (base): PushPort => ({
        ...base,
        notifications: null,
        deviceToken: null,
        tokenRenewal: null,
        localBanner: null,
    }),
};

export const { host: pushHost, shell: pushShell, browser: pushBrowser } = pushAdapters(webPush);
