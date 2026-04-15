import { useEffect } from 'react';
import DeviceInfo from 'react-native-device-info';
import { Platform } from 'react-native';
import Config from 'react-native-config';

import { onVersionCheckComplete } from '../../hooks/useAppVersionCheck';

import type { WebViewBridge } from '../index';
import type { AppMessageData, Env, Platform as AppPlatform } from '@chatic/app-messages';

/**
 * Sends version check result to WebView via OnUpdateDeviceInfo bridge message.
 * Covers the case where the version check completes after WebView has loaded.
 */
export const useVersionCheckHandler = (bridge: WebViewBridge) => {
    useEffect(() => {
        if (!bridge) return;

        const appVersion = DeviceInfo.getVersion();

        const unsubscribe = onVersionCheckComplete(result => {
            const message: AppMessageData<'OnUpdateDeviceInfo'> = {
                type: 'OnUpdateDeviceInfo',
                data: {
                    platform: Platform.OS.toLowerCase() as AppPlatform,
                    stage: (Config.VITE_ENV || 'PROD') as Env,
                    application: DeviceInfo.getApplicationName(),
                    currentVersion: appVersion,
                    latestVersion: result.latestVersion,
                    shouldUpdate: true,
                    appVersion,
                    webVersion: '',
                },
            };
            bridge.post(message);
        });

        return unsubscribe;
    }, [bridge]);
};
