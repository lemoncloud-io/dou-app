import type { IAppBridgeHost } from '@chatic/bridges';

import { DESKTOP_STORAGE_MEDIA, type ISecureStorage } from './secureStorage';
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
    /** The device vault behind the `nativeSecure` medium, read at app start. */
    secureStorage: Pick<ISecureStorage, 'get' | 'save' | 'clear'>;
}

/** Whether `medium` is one this shell keeps. The payload crosses a process boundary, so it is checked. */
const keepsMedium = (medium: unknown): boolean => (DESKTOP_STORAGE_MEDIA as readonly unknown[]).includes(medium);

const isStringRecord = (value: unknown): value is Record<string, string> =>
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.values(value).every(entry => typeof entry === 'string');

const isStringArray = (value: unknown): value is string[] =>
    Array.isArray(value) && value.every(entry => typeof entry === 'string');

const invalid = <T extends 'OnStorageGet' | 'OnStorageSave' | 'OnStorageClear'>(type: T, message: string) => ({
    type,
    success: false,
    error: { code: 'INVALID', message },
});

/**
 * Register native-capability handlers on the bridge host (web → app requests).
 *
 * Every desktop handler a web build can reach is registered here, except the two auto-update ones
 * (`updater.ts`, packaged builds only) and `WebAppReady` and `Ping` (answered inside `AppBridgeHost`).
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
        // @chatic/bridge-messages → bridges project-reference boundary, where the
        // emitted declaration can lag the source type.
        const { overlayIconDataUrl } = message.data as { overlayIconDataUrl?: string };
        const ok = deps.setBadgeCount(count, overlayIconDataUrl);
        return { type: 'OnSetBadgeCount', success: true, data: { success: ok } };
    });

    // SavePreference: `@chatic/theme` posts the theme on mount and on every change. Accepted and not
    // stored: the renderer's localStorage holds the theme, and nothing in the main process reads it.
    // Answered because desktop-web really sends it, so it should not draw an ERROR reply every time.
    // The post itself must keep coming: desktop-web sends no WebAppReady, so it is the first non-log
    // message a fresh window sends — the one that flushes the events buffered before it (an update
    // prompt, a re-minted FCM token).
    host.registerHandler('SavePreference', message => ({
        type: 'OnSavePreference',
        success: true,
        data: { key: message.data.key, success: true },
    }));

    // Storage*: the device vault (`nativeSecure`). Requests reach main only through the trusted-frame
    // gate on the bridge channel in index.ts, so only the main window's own web is answered. The vault
    // was read before the window was created; a StorageGet that still beats that read waits for it.
    host.registerHandler('StorageGet', async message => {
        if (!keepsMedium(message.data?.medium)) return invalid('OnStorageGet', 'Unknown storage medium');
        return { type: 'OnStorageGet', success: true, data: await deps.secureStorage.get() };
    });

    host.registerHandler('StorageSave', async message => {
        const { medium, set, remove } = message.data ?? {};
        if (!keepsMedium(medium)) return invalid('OnStorageSave', 'Unknown storage medium');
        if (!isStringRecord(set) || !isStringArray(remove)) {
            return invalid('OnStorageSave', 'set must map keys to strings and remove must list keys');
        }
        return { type: 'OnStorageSave', success: true, data: { ok: await deps.secureStorage.save(set, remove) } };
    });

    host.registerHandler('StorageClear', async message => {
        if (!keepsMedium(message.data?.medium)) return invalid('OnStorageClear', 'Unknown storage medium');
        return { type: 'OnStorageClear', success: true, data: { ok: await deps.secureStorage.clear() } };
    });
};
