import { useEffect } from 'react';
import DeviceInfo from 'react-native-device-info';
import { Platform } from 'react-native';
import Config from 'react-native-config';

import { onVersionCheckComplete } from '../../hooks';
import type { IAppBridgeHost } from '@chatic/bridges';
import type { Env, OnUpdateDeviceInfoPayload, Platform as AppPlatform } from '@chatic/app-messages';

/**
 * Sends version check result to WebView via OnUpdateDeviceInfo bridge message.
 * Covers the case where the version check completes after WebView has loaded.
 */
export const useVersionCheckHandler = (bridge: IAppBridgeHost) => {
    useEffect(() => {
        if (!bridge) return;
        const appVersion = DeviceInfo.getVersion();

        return onVersionCheckComplete(result => {
            bridge.pushEvent({
                type: 'OnUpdateDeviceInfo',
                data: {
                    platform: Platform.OS.toLowerCase() as AppPlatform,
                    stage: (Config.VITE_ENV || 'PROD') as Env,
                    application: DeviceInfo.getApplicationName(),
                    currentVersion: appVersion,
                    latestVersion: result.latestVersion,
                    shouldUpdate: true,
                    appVersion: appVersion,
                } as OnUpdateDeviceInfoPayload,
            } as any);
        });
    }, [bridge]);
};
