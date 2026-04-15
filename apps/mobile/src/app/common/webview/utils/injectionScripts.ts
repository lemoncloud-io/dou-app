import type { EdgeInsets } from 'react-native-safe-area-context';

/**
 * Parameter interface for injecting device information
 */
export interface DeviceInfoParams {
    platform: string;
    applicationName: string;
    stage: string;
    uniqueId: string;
    deviceModel: string;
    appVersion: string;
    buildNumber: string;
    appLanguage: string;
    installationId: string;
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
 * @param params Device and app information such as app version, OS platform, etc.
 * @returns JavaScript string to be injected into the WebView
 */
export const getDeviceInfoScript = (params: DeviceInfoParams): string => `
    window.CHATIC_APP_PLATFORM = '${params.platform}';
    window.CHATIC_APP_APPLICATION = '${params.applicationName}';
    window.CHATIC_APP_STAGE = '${params.stage}';
    window.CHATIC_APP_DEVICE_ID = '${params.uniqueId || ''}';
    window.CHATIC_APP_DEVICE_MODEL = '${params.deviceModel || ''}';
    window.CHATIC_APP_CURRENT_VERSION = '${params.appVersion}';
    window.CHATIC_APP_BUILD_NUMBER = '${params.buildNumber}';
    window.CHATIC_APP_CURRENT_LANGUAGE = '${params.appLanguage}';
    window.CHATIC_APP_INSTALLATION_ID = '${params.installationId}';

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
