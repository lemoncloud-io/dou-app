import type { EdgeInsets } from 'react-native-safe-area-context';

import type { ThemeMode } from '../../stores/themeMode';

/**
 * Parameter interface for injecting device information
 */
export interface DeviceInfoParams {
    /**
     * Identifier for this app run, issued once by the native shell. Injected so
     * web entries carry the same value as native ones from the same launch;
     * without it the web issues its own and the two sides do not line up.
     */
    runId: string;
    platform: string;
    applicationName: string;
    stage: string;
    /**
     * @deprecated Composite `deviceId:firebaseInstallId` string. Kept injected for
     * older web bundles; use `uniqueDeviceId` + `firebaseInstallationId` instead.
     */
    uniqueId: string;
    deviceModel: string;
    /** DeviceInfo.getSystemVersion() — the log context's `osVersion`. */
    osVersion: string;
    appVersion: string;
    buildNumber: string;
    appLanguage: string;
    /**
     * @deprecated Confusing name — this has always carried the bare unique device id,
     * not a Firebase installation id. Kept injected for older web bundles; use
     * `uniqueDeviceId` instead.
     */
    installationId: string;
    /** Bare unique device id (DeviceInfo.getUniqueIdSync()), stable across app reinstalls on iOS keychain / Android SSAID semantics. */
    uniqueDeviceId: string;
    /** Firebase installation id; empty string until the async Firebase lookup resolves. */
    firebaseInstallationId: string;
    latestVersion: string;
    shouldUpdate: boolean;
}

/**
 * Generates a script to inject the Safe Area and keyboard height as CSS variables (`--safe-*`, `--keyboard-height`) into the WebView.
 * The web frontend can use these variables to dynamically adjust UI margins according to the mobile device's notch, home indicator, and keyboard.
 *
 * @param insets Safe area information of the screen (top, bottom, left, right)
 * @param keyboardHeight The height of the currently active keyboard
 * @returns JavaScript string to be injected into the WebView
 */
export const getSafeAreaScript = (insets: EdgeInsets, keyboardHeight: number): string => `
    (function() {
        const root = document.documentElement;
        root.style.setProperty('--safe-top', '${insets.top}px');
        root.style.setProperty('--safe-bottom', '${insets.bottom}px');
        root.style.setProperty('--safe-left', '${insets.left}px');
        root.style.setProperty('--safe-right', '${insets.right}px');
        root.style.setProperty('--keyboard-height', '${keyboardHeight}px');
    })();
    true;
`;

/**
 * Generates a script that injects app and device information into the WebView's global (`window`) object,
 * and sets up the \`ChaticMessageHandler\` bridge, an integrated communication channel for sending messages from Web to App (Native).
 *
 * String values are JSON-stringified rather than wrapped in raw quotes: an unescaped quote or
 * backslash in a native-supplied string (e.g. a localized app display name or an odd device model
 * string on some Android OEMs) would otherwise break out of the literal and throw a SyntaxError
 * inside this injected script. Since the script has no `<script src>` to attribute the error to, the
 * browser reports it as an opaque, locationless "Script error." — this was the suspected root cause
 * of unexplained `[mobile] script-error` reports with no stack/location. `shouldUpdate` is boolean and
 * kept as a raw literal; downstream code reads it back as the string 'true'/'false' (deviceInfoStore.ts).
 *
 * @param params Device and app information such as app version, OS platform, etc.
 * @returns JavaScript string to be injected into the WebView
 */
export const getDeviceInfoScript = (params: DeviceInfoParams): string => `
    window.CHATIC_APP_RUN_ID = ${JSON.stringify(params.runId)};
    window.CHATIC_APP_PLATFORM = ${JSON.stringify(params.platform)};
    window.CHATIC_APP_APPLICATION = ${JSON.stringify(params.applicationName)};
    window.CHATIC_APP_STAGE = ${JSON.stringify(params.stage)};
    window.CHATIC_APP_DEVICE_ID = ${JSON.stringify(params.uniqueId || '')};
    window.CHATIC_APP_DEVICE_MODEL = ${JSON.stringify(params.deviceModel || '')};
    window.CHATIC_APP_OS_VERSION = ${JSON.stringify(params.osVersion || '')};
    window.CHATIC_APP_CURRENT_VERSION = ${JSON.stringify(params.appVersion)};
    window.CHATIC_APP_BUILD_NUMBER = ${JSON.stringify(params.buildNumber)};
    window.CHATIC_APP_CURRENT_LANGUAGE = ${JSON.stringify(params.appLanguage)};
    window.CHATIC_APP_INSTALLATION_ID = ${JSON.stringify(params.installationId)};
    window.CHATIC_APP_UNIQUE_DEVICE_ID = ${JSON.stringify(params.uniqueDeviceId)};
    window.CHATIC_APP_FIREBASE_INSTALLATION_ID = ${JSON.stringify(params.firebaseInstallationId)};
    window.CHATIC_APP_LATEST_VERSION = ${JSON.stringify(params.latestVersion)};
    window.CHATIC_APP_SHOULD_UPDATE = '${params.shouldUpdate}';

    const bridge = {
        postMessage: function(msg) {
            if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(msg);
            }
        }
    };

    window.ChaticMessageHandler = bridge;
    if (window.webkit && window.webkit.messageHandlers) {
        window.webkit.messageHandlers.ChaticMessageHandler = bridge;
    }
`;

/**
 * Generates a script exposing the persisted debug-mode unlock to the web, so a
 * restarted WebView boots already unlocked (single unlock covers both layers).
 */
export const getDebugModeScript = (enabled: boolean): string => `
    window.CHATIC_APP_DEBUG_MODE = ${enabled ? 'true' : 'false'};
`;

/**
 * Generates a script exposing the persisted theme to the web, so the WebView's pre-paint
 * script can pick it up on the FIRST paint instead of waiting for a bridge round-trip.
 *
 * This is the restore path after a WebView cache wipe: localStorage is empty, but native
 * still holds the theme. Injected before content loads (see AppWebView's
 * `injectedJavaScriptBeforeContentLoaded`), so `index.html` can read it while deciding the
 * initial `<html>` class, `theme-color`, and `--splash-bg`. A bridge message could not
 * arrive in time — it lands after the first paint.
 *
 * The value is already normalized by themeStorage, so the web never sees a legacy envelope.
 *
 * `JSON.stringify` rather than a quoted template hole: this string is handed to
 * `evaluateJavaScript`, so an unescaped quote/backslash/newline in the value would be code,
 * not data. The `ThemeMode` type plus the bridge-side validation make that unreachable today —
 * escaping at the sink is what keeps it unreachable if a future caller is less careful.
 */
export const getThemeScript = (theme: ThemeMode): string => `
    window.CHATIC_APP_THEME = ${JSON.stringify(theme)};
`;

/**
 * Parameters for generating the combined synchronous injection script.
 */
export interface SyncInjectionScriptParams {
    insets: EdgeInsets;
    keyboardHeight: number;
    deviceInfo: DeviceInfoParams;
    /** Persisted runtime debug unlock (see debugSettingsStore.debugModeEnabled). */
    debugModeEnabled?: boolean;
    /** Persisted theme mode (see themeStore) — seeds the web's first paint. */
    theme: ThemeMode;
}

/**
 * Combines safe area, device info, debug mode, and theme scripts into a single script.
 * The legacy console-override relay (`__console__`) is gone — the structured
 * `SendLog` pipeline is the only web→native log channel (ADR-0047).
 *
 * The whole body is guarded (ADR-0047 P2): a runtime failure inside any
 * injected snippet reports itself through the SendLog channel (tag INJECTION,
 * landing in the merged buffer / future breadcrumbs) instead of surfacing as
 * an opaque "Script error.". Syntax errors cannot be caught this way — those
 * are prevented at build time by JSON.stringify interpolation (see
 * getDeviceInfoScript and getThemeScript).
 */
export const getSyncInjectionScript = (params: SyncInjectionScriptParams): string => `
    try {
        ${getSafeAreaScript(params.insets, params.keyboardHeight)}
        ${getDeviceInfoScript(params.deviceInfo)}
        ${getDebugModeScript(params.debugModeEnabled ?? false)}
        ${getThemeScript(params.theme)}
    } catch (e) {
        try {
            window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'SendLog',
                data: {
                    level: 'error',
                    tag: 'INJECTION',
                    message: 'Injected script failed: ' + (e && e.message ? e.message : String(e)),
                    timestamp: Date.now(),
                    source: 'web'
                }
            }));
        } catch (ignored) {}
    }
    true;
`;
