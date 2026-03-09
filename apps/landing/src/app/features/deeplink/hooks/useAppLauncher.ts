import { useState, useCallback } from 'react';

import { APP_CONFIG, DEEPLINK_CONFIG } from '../constants';
import { storeDeferredDeepLink } from '../utils';

import type { DeviceType, DeepLinkState, DeepLinkInfo, DialogType } from '../types';

interface UseAppLauncherProps {
    deviceType: DeviceType;
    deepLinkInfo: DeepLinkInfo;
}

interface UseAppLauncherReturn {
    state: DeepLinkState;
    dialogType: DialogType;
    showAppConfirmDialog: () => void;
    confirmLaunchApp: () => void;
    confirmGoToStore: () => void;
    closeDialog: () => void;
}

/**
 * Hook to manage app launching flow with dialog confirmations.
 *
 * Flow:
 * 1. User clicks "앱 열기" → showAppConfirmDialog() → app-confirm dialog
 * 2. User confirms → confirmLaunchApp() → launching state → try to open app
 * 3. After timeout → store-confirm dialog (user can dismiss if app opened)
 * 4. User confirms → confirmGoToStore() → navigate to store
 */
export const useAppLauncher = ({ deviceType, deepLinkInfo }: UseAppLauncherProps): UseAppLauncherReturn => {
    const [state, setState] = useState<DeepLinkState>(deviceType === 'desktop' ? 'desktop' : 'initial');
    const [dialogType, setDialogType] = useState<DialogType>(null);

    const showAppConfirmDialog = useCallback(() => {
        setDialogType('app-confirm');
    }, []);

    const closeDialog = useCallback(() => {
        setDialogType(null);
        setState('initial');
    }, []);

    const confirmLaunchApp = useCallback(() => {
        if (deviceType === 'desktop') return;

        setDialogType(null);
        setState('launching');

        const pathWithoutLeadingSlash = deepLinkInfo.fullPath.replace(/^\//, '');

        if (deviceType === 'ios') {
            const customSchemeUrl = `${APP_CONFIG.scheme}://${pathWithoutLeadingSlash}`;
            console.log('[iOS] Opening:', customSchemeUrl);
            window.location.href = customSchemeUrl;
        } else if (deviceType === 'android') {
            const intentUrl =
                `intent://${pathWithoutLeadingSlash}` +
                `#Intent;scheme=${APP_CONFIG.scheme}` +
                `;package=${APP_CONFIG.packageId}` +
                `;S.browser_fallback_url=${encodeURIComponent(APP_CONFIG.storeUrls.android)}` +
                `;end`;
            console.log('[Android] Opening:', intentUrl);
            window.location.href = intentUrl;
        }

        // After timeout, show store dialog. User can dismiss if app actually opened.
        setTimeout(async () => {
            console.log(`[${deviceType}] Timeout reached, storing deferred link`);
            await storeDeferredDeepLink(deepLinkInfo.deepLinkUrl);
            setState('initial');
            setDialogType('store-confirm');
        }, DEEPLINK_CONFIG.launchTimeout);
    }, [deviceType, deepLinkInfo]);

    const confirmGoToStore = useCallback(() => {
        setDialogType(null);
        const storeUrl = deviceType === 'ios' ? APP_CONFIG.storeUrls.ios : APP_CONFIG.storeUrls.android;
        window.location.href = storeUrl;
    }, [deviceType]);

    return {
        state,
        dialogType,
        showAppConfirmDialog,
        confirmLaunchApp,
        confirmGoToStore,
        closeDialog,
    };
};
