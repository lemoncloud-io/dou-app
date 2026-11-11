/**
 * The sub view's IPC channels, shared by main and the sub view's preload. Its own pair, never the
 * main window's `chatic-bridge:*`: a page's message must not be able to reach the main window's host
 * even by mistake. Electron-free so the preload can import it.
 */
export const SUB_WEBVIEW_TO_APP_CHANNEL = 'chatic-sub-webview:to-app';
/** Main → page. Each message travels base64-encoded (UTF-8), which the preload hands on as is. */
export const SUB_WEBVIEW_TO_WEB_CHANNEL = 'chatic-sub-webview:to-web';

/** The URL the bar's close control navigates to, which main intercepts and never loads. */
export const SUB_WEBVIEW_CLOSE_URL = 'chatic-sub-webview:close';

/**
 * The preload → main synchronous request for the view's boot data, `{ origin, script }` or `null`: the
 * origin the view was opened on, and the script that defines the page's context there.
 */
export const SUB_WEBVIEW_BOOT_CHANNEL = 'chatic-sub-webview:boot';
