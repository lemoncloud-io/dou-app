import { webClient } from '@chatic/bridges';
import { pushAdapters } from '@chatic/runtime-web';
import type { PushPort, ShellOrBrowserImplementations } from '@chatic/runtime-web';

// A direct path, not the `bridge` barrel: the barrel re-exports its navigation, which pulls in the
// web transport and its `import.meta.env` — a syntax error under ts-jest's CommonJS output.
import { appBridge } from '../../app/bridge/appBridge';

/**
 * Who receives notifications for this device in the web app: the shell or the page. Its shell is the
 * phone app, reached through `appBridge`; the page uses what any browser offers, which is nothing here.
 *
 * The phone app hands the page its notifications and its push token. It raises its banners from the push
 * itself, never on the page's request, and announces no renewed token: it is fetched again at the next
 * launch.
 */
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

/** `push.host` follows what the host declared; `.shell` and `.browser` force a side the host allows. */
export const { host: pushHost, shell: pushShell, browser: pushBrowser } = pushAdapters(webPush);
