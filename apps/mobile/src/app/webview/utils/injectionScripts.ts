import type { EdgeInsets } from 'react-native-safe-area-context';
import type { Env, RuntimeOffer, StorageMedium } from '@chatic/bridge-messages';

import type { ThemeMode } from '../../stores/themeMode';
import type { HostCapabilities } from './hostCapabilities';

export interface DeviceInfoParams {
    runId: string;
    platform: string;
    applicationName: string;
    stage: Env;
    consoleEnabled: boolean;
    uniqueId: string;
    deviceModel: string;
    osVersion: string;
    appVersion: string;
    buildNumber: string;
    appLanguage: string;
    installationId: string;
    uniqueDeviceId: string;
    firebaseInstallationId: string;
    latestVersion: string;
    shouldUpdate: boolean;
}

export const getSafeAreaScript = (insets: EdgeInsets, keyboardHeight: number): string => `
    (function() {
        const root = document.documentElement;
        // Android can run the boot script before the document has a root element. The post-load
        // script and the inset effect set these again once it exists.
        if (!root) return;
        root.style.setProperty('--safe-top', '${insets.top}px');
        root.style.setProperty('--safe-bottom', '${insets.bottom}px');
        root.style.setProperty('--safe-left', '${insets.left}px');
        root.style.setProperty('--safe-right', '${insets.right}px');
        root.style.setProperty('--keyboard-height', '${keyboardHeight}px');
    })();
    true;
`;

export const getDeviceInfoScript = (params: DeviceInfoParams): string => `
    window.CHATIC_APP_RUN_ID = ${JSON.stringify(params.runId)};
    window.CHATIC_APP_PLATFORM = ${JSON.stringify(params.platform)};
    window.CHATIC_APP_APPLICATION = ${JSON.stringify(params.applicationName)};
    window.CHATIC_APP_STAGE = ${JSON.stringify(params.stage)};
    window.CHATIC_APP_CONSOLE_ENABLED = ${JSON.stringify(params.consoleEnabled)};
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

export const getDebugModeScript = (enabled: boolean): string => `
    window.CHATIC_APP_DEBUG_MODE = ${enabled ? 'true' : 'false'};
`;

export const getLogUploadHoldScript = (hold: boolean): string => `
    window.CHATIC_APP_LOG_UPLOAD_HOLD = ${hold ? 'true' : 'false'};
`;

export const getThemeScript = (theme: ThemeMode): string => `
    window.CHATIC_APP_THEME = ${JSON.stringify(theme)};
`;

export const getConfigBagScript = (bag: Readonly<Record<string, string>>): string => `
    window.CHATIC_APP_CONFIG_BAG = ${JSON.stringify(bag)};
`;

export const getStorageMediaScript = (media: readonly StorageMedium[]): string => `
    window.CHATIC_APP_STORAGE_MEDIA = ${JSON.stringify(media)};
`;

export const getCapabilitiesScript = (capabilities: HostCapabilities | undefined): string =>
    capabilities ? `\n    window.CHATIC_APP_CAPABILITIES = ${JSON.stringify(capabilities)};\n` : '';

export const getRuntimeOfferScript = (offer: RuntimeOffer | null | undefined): string =>
    offer ? `\n    window.CHATIC_APP_RUNTIME = ${JSON.stringify(offer)};\n` : '';

export interface SyncInjectionScriptParams {
    insets: EdgeInsets;
    keyboardHeight: number;
    deviceInfo: DeviceInfoParams;
    debugModeEnabled?: boolean;
    logUploadHold?: boolean;
    theme: ThemeMode;
    configBag?: Readonly<Record<string, string>>;
    storageMedia?: readonly StorageMedium[];
    runtimeOffer?: RuntimeOffer | null;
    capabilities?: HostCapabilities;
}

export const getSyncInjectionScript = (params: SyncInjectionScriptParams): string => `
    try {
        ${getStorageMediaScript(params.storageMedia ?? [])}
        ${getCapabilitiesScript(params.capabilities)}
        ${getRuntimeOfferScript(params.runtimeOffer)}
        ${getSafeAreaScript(params.insets, params.keyboardHeight)}
        ${getDeviceInfoScript(params.deviceInfo)}
        ${getDebugModeScript(params.debugModeEnabled ?? false)}
        ${getLogUploadHoldScript(params.logUploadHold ?? false)}
        ${getThemeScript(params.theme)}
        ${getConfigBagScript(params.configBag ?? {})}
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
