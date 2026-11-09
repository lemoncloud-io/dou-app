import type { SubWebViewErrorCode, SubWebViewOpenScope } from '@chatic/bridge-messages';
import type { AppBridgeHostConfig, IAppBridgeHost } from '@chatic/bridges';

import { DESKTOP_STORAGE_MEDIA, type ISecureStorage } from './secureStorage';
import type { DesktopSubWebViewService } from './subWebView/DesktopSubWebViewService';
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
    /** The sub view the web opens over the main window. */
    subWebView: Pick<DesktopSubWebViewService, 'open' | 'close'>;
}

/**
 * How far this shell's `OpenSubWebView` opens: any plain https site, in the `external` tier, as well
 * as the hub and the reviewed pages. The web offers an owner's own link only when the handshake says so.
 */
export const DESKTOP_SUB_WEBVIEW_OPEN_SCOPE: SubWebViewOpenScope = 'anyHttps';

/**
 * The main window's host options beyond `sendToWeb` — what its handshake reports. One constant so
 * `index.ts` and the contract suite build the same host.
 */
export const DESKTOP_MAIN_HOST_OPTIONS = {
    subWebViewOpenScope: DESKTOP_SUB_WEBVIEW_OPEN_SCOPE,
} satisfies Partial<AppBridgeHostConfig>;

const SUB_WEBVIEW_ERRORS: Record<SubWebViewErrorCode, string> = {
    INVALID:
        'An https url is required; title must be a string, params a JSON object of at most 16 KiB and appId one lower-case label.',
    NOT_ALLOWED: 'This shell does not open the url: it is not plain https, or could be read two ways.',
    ALREADY_OPEN: 'A sub WebView is already showing.',
    NOT_OPEN: 'No sub WebView with this viewId is showing.',
};

const subWebViewFailure = <T extends 'OnOpenSubWebView' | 'OnCloseSubWebView'>(type: T, code: SubWebViewErrorCode) => ({
    type,
    success: false,
    error: { code, message: SUB_WEBVIEW_ERRORS[code] },
});

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

    // OpenSubWebView / CloseSubWebView: the main window's web shows a page over itself and takes it
    // away. What may open is the service's (the shared trust rule); the view itself is the window's.
    host.registerHandler('OpenSubWebView', async message => {
        const result = deps.subWebView.open({
            url: message.data?.url,
            title: message.data?.title,
            params: message.data?.params,
            appId: message.data?.appId,
        });
        if (!result.ok) return subWebViewFailure('OnOpenSubWebView', result.code);
        return { type: 'OnOpenSubWebView', success: true, data: { viewId: result.view.viewId } };
    });

    host.registerHandler('CloseSubWebView', async message => {
        const result = deps.subWebView.close(message.data?.viewId, 'host');
        if (!result.ok) return subWebViewFailure('OnCloseSubWebView', result.code);
        return { type: 'OnCloseSubWebView', success: true, data: {} };
    });

    host.registerHandler('StorageClear', async message => {
        if (!keepsMedium(message.data?.medium)) return invalid('OnStorageClear', 'Unknown storage medium');
        return { type: 'OnStorageClear', success: true, data: { ok: await deps.secureStorage.clear() } };
    });
};
