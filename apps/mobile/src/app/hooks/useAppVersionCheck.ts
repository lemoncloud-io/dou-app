import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Linking, Platform } from 'react-native';

import { getAppLanguage, t } from '../utils';
import { versionService } from '../services';
import { STORE_URLS } from '@chatic/shared';

/**
 * Module-level cache for version check result.
 * Accessible from outside the hook (e.g., AppWebView injection script).
 */
export interface VersionCheckResult {
    hasUpdate: boolean;
    latestVersion: string;
}

let versionCheckResult: VersionCheckResult | null = null;
const listeners = new Set<(result: VersionCheckResult) => void>();

// eslint-disable-next-line @typescript-eslint/no-empty-function
const noop = () => {};

export const getVersionCheckResult = (): VersionCheckResult | null => versionCheckResult;

/**
 * Subscribe to version check completion. If already checked, fires immediately.
 * @returns unsubscribe function
 */
export const onVersionCheckComplete = (listener: (result: VersionCheckResult) => void): (() => void) => {
    if (versionCheckResult) {
        listener(versionCheckResult);
        return noop;
    }
    listeners.add(listener);
    return () => listeners.delete(listener);
};

/**
 * Hook to check for app updates and show native alert.
 *
 * The actual live-version lookup and comparison lives in `versionService`
 * (iOS only for now — Android safe-falls back to "no update" until a backend
 * live-version endpoint exists). This hook only caches the result for the
 * module-level singleton consumers below and drives the native alert.
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

    // Check for updates on mount, once.
    useEffect(() => {
        if (!checkOnMount || hasCheckedRef.current) {
            return;
        }
        hasCheckedRef.current = true;

        const checkVersion = async () => {
            const check = await versionService.checkForUpdate();
            if (!check.updateAvailable) return;

            const result: VersionCheckResult = { hasUpdate: true, latestVersion: check.latestVersion };
            versionCheckResult = result;
            setHasUpdate(true);
            listeners.forEach(fn => fn(result));
        };

        void checkVersion();
    }, [checkOnMount]);

    return { hasUpdate, showUpdateAlert };
};
