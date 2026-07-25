import { contextBridge, ipcRenderer, webFrame } from 'electron';

/** IPC channel for App(main) → Web(renderer) bridge messages. */
const TO_WEB_CHANNEL = 'chatic-bridge:to-web';
/** IPC channel for Web(renderer) → App(main) bridge messages. */
const TO_APP_CHANNEL = 'chatic-bridge:to-app';
/** IPC channel for the custom-UI PoC controls. One channel, so main gates the origin once. */
const CUSTOM_UI_CHANNEL = 'chatic-custom-ui';

/** Result of every custom-UI request; `error` is set instead of rejecting so the panel can show it. */
interface CustomUiStatus {
    active: boolean;
    root: string | null;
    error?: string;
}

/**
 * Device/app globals injected into the page's main world.
 * Mirrors the keys the mobile native side injects via getDeviceInfoScript()
 * (apps/mobile/src/app/webview/utils/injectionScripts.ts). Platform is 'desktop'.
 */
// Values injected by main via additionalArguments — the preload has no shell env, and
// npm_package_version is undefined in a packaged app (it used to fall back to '0.0.1'
// and stage to 'dev' in production).
const argValue = (name: string): string => {
    const prefix = `--${name}=`;
    const arg = process.argv.find(a => a.startsWith(prefix));
    return arg ? arg.slice(prefix.length) : '';
};
const deviceId = argValue('chatic-device-id');
const stage = argValue('chatic-stage') || 'dev';
const appVersion = argValue('chatic-app-version') || '0.0.1';

const deviceInfo = {
    CHATIC_APP_PLATFORM: 'desktop',
    CHATIC_APP_APPLICATION: 'chatic-desktop',
    CHATIC_APP_STAGE: stage,
    CHATIC_APP_DEVICE_ID: deviceId,
    CHATIC_APP_DEVICE_MODEL: process.platform,
    CHATIC_APP_CURRENT_VERSION: appVersion,
    CHATIC_APP_BUILD_NUMBER: '1',
    CHATIC_APP_CURRENT_LANGUAGE: process.env.VITE_DESKTOP_LANGUAGE ?? 'en',
    CHATIC_APP_INSTALLATION_ID: deviceId,
    CHATIC_APP_LATEST_VERSION: appVersion,
    CHATIC_APP_SHOULD_UPDATE: 'false',
} as const;

/**
 * Web → App: NativeBridgeAdapter.postMessage prefers window.ChaticMessageHandler.postMessage,
 * and provider.isNative() returns true when this global exists. Exposing it to the main world
 * via contextBridge therefore both satisfies isNative() and routes requests to the host.
 */
contextBridge.exposeInMainWorld('ChaticMessageHandler', {
    postMessage: (message: string) => ipcRenderer.send(TO_APP_CHANNEL, message),
});

/**
 * Expose app version and platform information for the renderer process.
 * Used by desktop-web to display version info in settings and debug pages.
 *
 * `customUi` drives the custom-web-bundle PoC from the debug panel. Deliberately not routed
 * through the AppBridge message map: that wire contract is shared with mobile, and a desktop
 * -only PoC has no business bumping BRIDGE_VERSION (ADR-0001).
 */
contextBridge.exposeInMainWorld('electronAPI', {
    appVersion,
    platform: process.platform,
    customUi: {
        apply: (zipUrl: string): Promise<CustomUiStatus> =>
            ipcRenderer.invoke(CUSTOM_UI_CHANNEL, { action: 'apply', zipUrl }),
        disable: (): Promise<CustomUiStatus> => ipcRenderer.invoke(CUSTOM_UI_CHANNEL, { action: 'disable' }),
        status: (): Promise<CustomUiStatus> => ipcRenderer.invoke(CUSTOM_UI_CHANNEL, { action: 'status' }),
    },
});

// Inject the CHATIC_APP_* globals into the page's main world. Values come from env, so we
// base64-encode the JSON (charset [A-Za-z0-9+/=], injection-safe) and decode it inside the
// snippet — JSON.stringify alone would not escape </script>/U+2028/U+2029 in an env value.
const deviceInfoBase64 = Buffer.from(JSON.stringify(deviceInfo), 'utf8').toString('base64');

webFrame.executeJavaScript(
    `(() => {` +
        `const info = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob("${deviceInfoBase64}"), c => c.charCodeAt(0))));` +
        `Object.assign(window, info);` +
        `})();`
);

/**
 * App → Web: NativeBridgeAdapter listens via window.addEventListener('message', ...) and reads
 * event.data (a string). executeJavaScript runs in the page's main world, so the adapter fires.
 *
 * SECURITY: never interpolate message data into the code string — JSON.stringify does not escape
 * </script>, U+2028, or U+2029, so any user-derived field (channel name, message body) could break
 * out and execute arbitrary JS. We base64-encode the payload (charset [A-Za-z0-9+/=], injection-safe)
 * and decode it inside the snippet, so the data never participates in the JS grammar.
 */
ipcRenderer.on(TO_WEB_CHANNEL, (_event, data: string) => {
    if (typeof data !== 'string') return;
    const base64 = Buffer.from(data, 'utf8').toString('base64');
    webFrame.executeJavaScript(
        `window.dispatchEvent(new MessageEvent('message', {` +
            `data: new TextDecoder().decode(Uint8Array.from(atob("${base64}"), c => c.charCodeAt(0)))` +
            `}));`
    );
});
