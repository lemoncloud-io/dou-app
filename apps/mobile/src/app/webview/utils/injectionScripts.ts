import type { EdgeInsets } from 'react-native-safe-area-context';

/**
 * Parameter interface for injecting device information
 */
export interface DeviceInfoParams {
    platform: string;
    applicationName: string;
    stage: string;
    /**
     * @deprecated Composite `deviceId:firebaseInstallId` string. Kept injected for
     * older web bundles; use `uniqueDeviceId` + `firebaseInstallationId` instead.
     */
    uniqueId: string;
    deviceModel: string;
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
    window.CHATIC_APP_PLATFORM = ${JSON.stringify(params.platform)};
    window.CHATIC_APP_APPLICATION = ${JSON.stringify(params.applicationName)};
    window.CHATIC_APP_STAGE = ${JSON.stringify(params.stage)};
    window.CHATIC_APP_DEVICE_ID = ${JSON.stringify(params.uniqueId || '')};
    window.CHATIC_APP_DEVICE_MODEL = ${JSON.stringify(params.deviceModel || '')};
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
 * Generates a script that intercepts (overrides) \`console.log\` and \`console.error\` calls within the WebView
 * and forwards them to the React Native app's bridge (as a \`__console__\` type message).
 * This makes it easy to check the internal logs of the WebView even in a native debugging environment (e.g., Flipper, Metro Console).
 *
 * @returns JavaScript string to be injected into the WebView
 */
export const getConsoleOverrideScript = (): string => `
    const _origLog = console.log.bind(console);
    const _origError = console.error.bind(console);
    console.log = (...args) => {
        _origLog(...args);
        try { window.ReactNativeWebView?.postMessage(JSON.stringify({ type: '__console__', level: 'log', msg: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') })); } catch(e) {}
    };
    console.error = (...args) => {
        _origError(...args);
        try { window.ReactNativeWebView?.postMessage(JSON.stringify({ type: '__console__', level: 'error', msg: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') })); } catch(e) {}
    };
`;

/**
 * Generates a script exposing the persisted debug-mode unlock to the web, so a
 * restarted WebView boots already unlocked (single unlock covers both layers).
 */
export const getDebugModeScript = (enabled: boolean): string => `
    window.CHATIC_APP_DEBUG_MODE = ${enabled ? 'true' : 'false'};
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
}

/**
 * Combines safe area, device info, debug mode, and console override scripts into a single script.
 */
export const getSyncInjectionScript = (params: SyncInjectionScriptParams): string => `
    ${getSafeAreaScript(params.insets, params.keyboardHeight)}
    ${getDeviceInfoScript(params.deviceInfo)}
    ${getDebugModeScript(params.debugModeEnabled ?? false)}
    ${getConsoleOverrideScript()}
`;
