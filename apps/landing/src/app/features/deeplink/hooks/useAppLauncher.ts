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
    confirmLaunchApp: () => Promise<void>;
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

    const confirmLaunchApp = useCallback(async () => {
        if (deviceType === 'desktop') return;

        setDialogType(null);
        setState('launching');

        // Store deferred link BEFORE launching app.
        // iOS custom scheme may open the app without passing the URL path,
        // so the app needs a fallback to retrieve the invite from Firestore.
        await storeDeferredDeepLink(deepLinkInfo.deepLinkUrl);

        const pathWithoutLeadingSlash = deepLinkInfo.fullPath.replace(/^\//, '');

        if (deviceType === 'ios') {
            const customSchemeUrl = `${APP_CONFIG.scheme}://${pathWithoutLeadingSlash}`;
            window.location.href = customSchemeUrl;
        } else if (deviceType === 'android') {
            const intentUrl =
                `intent://${pathWithoutLeadingSlash}` +
                `#Intent;scheme=${APP_CONFIG.scheme}` +
                `;package=${APP_CONFIG.packageId}` +
                `;S.browser_fallback_url=${encodeURIComponent(APP_CONFIG.storeUrls.android)}` +
                `;end`;
            window.location.href = intentUrl;
        }

        // After timeout, show store dialog. User can dismiss if app actually opened.
        setTimeout(() => {
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
