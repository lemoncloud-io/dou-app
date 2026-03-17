import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Linking, Platform } from 'react-native';
import DeviceInfo from 'react-native-device-info';

import { STORE_URLS } from '@chatic/shared';

import { t } from '../i18n';
import { getAppLanguage } from '../utils/device';

const IOS_BUNDLE_ID = 'io.chatic.dou';
const APP_STORE_LOOKUP_URL = `https://itunes.apple.com/lookup?bundleId=${IOS_BUNDLE_ID}`;

interface AppStoreLookupResponse {
    resultCount: number;
    results: Array<{
        version: string;
    }>;
}

/**
 * Parse version string into numeric parts for comparison
 */
const parseVersion = (version: string): number[] => {
    return version
        .replace(/^v/, '')
        .split('.')
        .map(part => parseInt(part, 10) || 0);
};

/**
 * Compare two semantic versions
 * @returns true if latest is newer than current
 */
const isNewerVersion = (latest: string, current: string): boolean => {
    const latestParts = parseVersion(latest);
    const currentParts = parseVersion(current);
    const maxLength = Math.max(latestParts.length, currentParts.length);

    for (let i = 0; i < maxLength; i++) {
        const latestPart = latestParts[i] || 0;
        const currentPart = currentParts[i] || 0;

        if (latestPart > currentPart) return true;
        if (latestPart < currentPart) return false;
    }
    return false;
};

/**
 * Hook to check for app updates and show native alert.
 *
 * Note: Currently iOS only. Android doesn't have a public Play Store API.
 * For Android, consider implementing a backend version endpoint.
 *
 * @param checkOnMount - Whether to check for updates on mount (default: true)
 */
export const useAppVersionCheck = (checkOnMount = true) => {
    const [hasUpdate, setHasUpdate] = useState(false);
    const hasCheckedRef = useRef(false);

    const showUpdateAlert = useCallback((): void => {
        const language = getAppLanguage();
        const storeUrl = Platform.OS === 'ios' ? STORE_URLS.ios : STORE_URLS.android;

        Alert.alert(
            t('app.updateDialog.title', language),
            t('app.updateDialog.message', language),
            [
                {
                    text: t('app.updateDialog.later', language),
                    style: 'cancel',
                },
                {
                    text: t('app.updateDialog.update', language),
                    onPress: () => {
                        void Linking.openURL(storeUrl);
                    },
                },
            ],
            { cancelable: true }
        );
    }, []);

    // Check for updates on mount (iOS only, once)
    useEffect(() => {
        if (!checkOnMount || hasCheckedRef.current || Platform.OS !== 'ios') {
            return;
        }
        hasCheckedRef.current = true;

        const checkVersion = async () => {
            try {
                const response = await fetch(APP_STORE_LOOKUP_URL, {
                    method: 'GET',
                    headers: { 'Cache-Control': 'no-cache' },
                });

                if (!response.ok) return;

                const data: AppStoreLookupResponse = await response.json();
                const latestVersion = data.results?.[0]?.version;

                if (latestVersion && isNewerVersion(latestVersion, DeviceInfo.getVersion())) {
                    setHasUpdate(true);
                }
            } catch {
                // Silent fail - version check is not critical
            }
        };

        void checkVersion();
    }, [checkOnMount]);

    return { hasUpdate, showUpdateAlert };
};
