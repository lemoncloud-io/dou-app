import { webClient } from '@chatic/bridges';
import { pushAdapters } from '@chatic/runtime-web';
import type { PushPort, ShellOrBrowserImplementations } from '@chatic/runtime-web';

import { onDesktopNotification } from './notificationFeed';

/**
 * Who receives notifications for this device in desktop-web: the shell or the page. Its shell is the
 * desktop app, reached through `webClient` requests; the page uses what any browser offers, which is
 * nothing here.
 *
 * The desktop app hands the page its notifications — banner clicks, and its menu bar's links on the same
 * message — and its push token, announces each token it mints again, and raises an OS banner when the
 * page asks: the page decides what is worth one.
 */
export const desktopPush: ShellOrBrowserImplementations<'push'> = {
    shell: (base): PushPort => ({
        ...base,
        // The same message also carries the OAuth hand-off's deeplinks, which `signIn` reads through
        // the same subscription helper.
        notifications: { onReceive: listener => onDesktopNotification(listener) },
        // The main process answers `FetchFcmToken` itself, the same request the phone app answers.
        deviceToken: {
            fetch: async () => (await webClient.request({ type: 'FetchFcmToken', data: {} })).data?.token ?? null,
        },
        // The main process pushes `OnFetchFcmToken` unprompted when the token is minted again: the app
        // stays open for days, and waiting for the next launch would leave the endpoint stale that long.
        tokenRenewal: {
            onRenew: listener =>
                webClient.onEvent('OnFetchFcmToken', () => {
                    listener();
                }),
        },
        localBanner: {
            present: banner => {
                void webClient
                    .request({ type: 'ShowNotification', data: banner })
                    // An older app answers NATIVE_NOT_SUPPORTED, and the bridge can fail in passing; a
                    // dropped OS banner must never break the renderer.
                    .catch(() => undefined);
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

/** `push.host` follows what the host declared; `.shell` and `.browser` force a side the host allows. */
export const { host: pushHost, shell: pushShell, browser: pushBrowser } = pushAdapters(desktopPush);
