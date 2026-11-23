import type { Env } from '@chatic/bridge-messages';

import { buildInjectedUniqueId } from './buildInjectedUniqueId';
import type { DeviceInfoParams } from './injectionScripts';

export interface CachedDeviceInfo {
    platform: string;
    applicationName: string;
    deviceModel: string;
    appVersion: string;
    buildNumber: string;
    deviceId: string;
    osVersion: string;
    runId: string;
}

export interface DynamicDeviceInfo {
    stage: Env;
    consoleEnabled: boolean;
    appLanguage: string;
    firebaseInstallId?: string | null;
    latestVersion: string;
    shouldUpdate: boolean;
}

export const buildDeviceInfoParams = (cached: CachedDeviceInfo, dynamic: DynamicDeviceInfo): DeviceInfoParams => {
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
        installationId: cached.deviceId,
        uniqueDeviceId: cached.deviceId,
        firebaseInstallationId: dynamic.firebaseInstallId ?? '',
        latestVersion: dynamic.latestVersion,
        shouldUpdate: dynamic.shouldUpdate,
    };
};
