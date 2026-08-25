import { buildInjectedUniqueId } from './buildInjectedUniqueId';
import type { DeviceInfoParams } from './injectionScripts';

/**
 * Device/app values that are stable for the lifetime of the process. These come from synchronous
 * native bridge calls (DeviceInfo.*) and Platform, so they are read once at module load in AppWebView
 * and reused for every render instead of hitting the bridge on the injection-script critical path.
 */
export interface CachedDeviceInfo {
    /** Lowercased Platform.OS. */
    platform: string;
    /** DeviceInfo.getApplicationName(). */
    applicationName: string;
    /** DeviceInfo.getDeviceId() — hardware model identifier. */
    deviceModel: string;
    /** DeviceInfo.getVersion(). */
    appVersion: string;
    /** DeviceInfo.getBuildNumber(). */
    buildNumber: string;
    /** DeviceInfo.getUniqueIdSync() — bare unique device id. */
    deviceId: string;
    /** DeviceInfo.getSystemVersion(). */
    osVersion: string;
    /**
     * Identifier for this app run. Not a device fact, but it shares the exact
     * lifetime of these values — issued once at process start — so it rides
     * along rather than being threaded separately.
     */
    runId: string;
}

/**
 * Values that can change during the app lifecycle and must be supplied per render.
 */
export interface DynamicDeviceInfo {
    stage: string;
    /**
     * Whether this build's console listener is live — the web reads it to decide
     * whether relaying `debug` reaches anything.
     *
     * Passed in rather than read from `__DEV__` here so this stays a pure
     * function, which is the reason it was extracted in the first place.
     */
    consoleEnabled: boolean;
    appLanguage: string;
    /** Firebase installation id; resolves asynchronously, absent until then. */
    firebaseInstallId?: string | null;
    latestVersion: string;
    shouldUpdate: boolean;
}

/**
 * Assembles the DeviceInfoParams injected into the WebView from the cached (static) device values and
 * the dynamic per-render values. Extracted as a pure function so the field mapping — which deprecated
 * fields still get the bare device id, how the composite uniqueId is built — is unit-testable without
 * mounting the WebView.
 */
export const buildDeviceInfoParams = (cached: CachedDeviceInfo, dynamic: DynamicDeviceInfo): DeviceInfoParams => {
    // Push testing targets a device by `deviceId:firebaseInstallId`; until the async Firebase id
    // resolves this falls back to the bare device id (see buildInjectedUniqueId).
    const uniqueId = buildInjectedUniqueId(cached.deviceId, dynamic.firebaseInstallId);

    return {
        runId: cached.runId,
        platform: cached.platform,
        applicationName: cached.applicationName,
        stage: dynamic.stage,
        consoleEnabled: dynamic.consoleEnabled,
        uniqueId,
        deviceModel: cached.deviceModel || '',
        osVersion: cached.osVersion,
        appVersion: cached.appVersion,
        buildNumber: cached.buildNumber,
        appLanguage: dynamic.appLanguage,
        // Migration targets: web registers devices with `uniqueDeviceId` once app versions carrying
        // these fields are prevalent; the deprecated uniqueId/installationId stay injected for older
        // web bundles.
        installationId: cached.deviceId,
        uniqueDeviceId: cached.deviceId,
        firebaseInstallationId: dynamic.firebaseInstallId ?? '',
        latestVersion: dynamic.latestVersion,
        shouldUpdate: dynamic.shouldUpdate,
    };
};
