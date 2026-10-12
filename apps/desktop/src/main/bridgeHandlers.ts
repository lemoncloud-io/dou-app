import type { IAppBridgeHost } from '@chatic/bridges';

import { fetchUrlMetadata } from './unfurl';

/**
 * What the handlers need from the window and the OS. Injected rather than imported so this module
 * stays electron-free — jest cannot load electron, and the bridge contract suite has to load this
 * file to see what the shell answers.
 */
export interface DesktopBridgeDeps {
    /** Raise an OS notification for the current window; a click routes `deeplink` into the web. */
    showNotification: (params: { title: string; body: string; deeplink?: string }) => void;
    /** Resolves the FCM token once registration lands, or `''` if it never does. */
    awaitFcmToken: () => Promise<string>;
    /** Paint the unread badge; returns whether the OS took it. */
    setBadgeCount: (count: number, overlayIconDataUrl?: string) => boolean;
}

/**
 * Register native-capability handlers on the bridge host (web → app requests).
 *
 * Every desktop handler a web build can reach is registered here, except the two auto-update ones
 * (`updater.ts`, packaged builds only) and `WebAppReady` (answered inside `AppBridgeHost`).
 * `bridgeHandlers.contract.test.ts` loads only these two files, and fails if any other file in the
 * shell calls `registerHandler`.
 */
export const registerHandlers = (host: IAppBridgeHost, deps: DesktopBridgeDeps): void => {
    // ShowNotification: the live web WS detected a message in the CURRENT cloud →
    // show an OS notification. (Cross-cloud pushes arrive via FCM, see startFcm.)
    host.registerHandler('ShowNotification', message => {
        const { title, body, deeplink } = message.data;
        deps.showNotification({ title, body, deeplink });
        return { type: 'OnShowNotification', success: true, data: { success: true } };
    });

    // FetchUrlMetadata: fetch + parse og: tags for chat link previews on the
    // renderer's behalf (CORS blocks it there). SSRF guards live in unfurl.ts.
    host.registerHandler('FetchUrlMetadata', async message => {
        const { url } = message.data;
        const meta = await fetchUrlMetadata(url);
        return { type: 'OnFetchUrlMetadata', success: true, data: meta };
    });

    // FetchFcmToken: the renderer asks for the FCM token to register with the
    // broker (reg-dev, platform 'desktop'). Awaits the in-flight Android
    // registration; resolves '' if FCM is unconfigured/slow so the web degrades.
    host.registerHandler('FetchFcmToken', async () => {
        const token = await deps.awaitFcmToken();
        return { type: 'OnFetchFcmToken', success: true, data: { token } };
    });

    // SetBadgeCount: unread badge. How it is painted is per platform — see setBadgeCount in index.ts.
    host.registerHandler('SetBadgeCount', message => {
        const { count } = message.data;
        // Optional Windows overlay PNG. Read structurally: the field crosses the
        // @chatic/app-messages → bridges project-reference boundary, where the
        // emitted declaration can lag the source type.
        const { overlayIconDataUrl } = message.data as { overlayIconDataUrl?: string };
        const ok = deps.setBadgeCount(count, overlayIconDataUrl);
        return { type: 'OnSetBadgeCount', success: true, data: { success: ok } };
    });
};
