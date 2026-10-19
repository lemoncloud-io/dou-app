import { useState, useCallback, useEffect, useRef } from 'react';

import { APP_CONFIG, DEEPLINK_CONFIG } from '../constants';
import { APP_MISSING_HASH, buildAppLaunchUrl, openUrl } from '../utils';

import type { DeviceType, DeepLinkState, DeepLinkInfo, DialogType } from '../types';

interface UseAppLauncherProps {
    deviceType: DeviceType;
    deepLinkInfo: DeepLinkInfo;
    /** Try the app once on mount, without waiting for the user to tap "Open app". */
    autoLaunch: boolean;
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
 * This page only renders when the OS did not hand the link to the app itself — an in-app browser
 * (KakaoTalk) or a browser loading the URL directly (Chrome) never triggers a Universal Link or App
 * Link. So when `autoLaunch` is set, the app is tried on mount, and the buttons stay as the fallback.
 *
 * Flow:
 * 1. User clicks "Open app" → showAppConfirmDialog() → app-confirm dialog
 * 2. User confirms → confirmLaunchApp() → launching state → try to open app
 * 3. After timeout, if this page is still showing → store-confirm dialog
 * 4. User confirms → confirmGoToStore() → navigate to store
 */
export const useAppLauncher = ({ deviceType, deepLinkInfo, autoLaunch }: UseAppLauncherProps): UseAppLauncherReturn => {
    const [state, setState] = useState<DeepLinkState>(deviceType === 'desktop' ? 'desktop' : 'initial');
    const [dialogType, setDialogType] = useState<DialogType>(null);
    const autoLaunchedRef = useRef(false);
    // Deliberately not cleared on unmount. StrictMode unmounts and remounts once in development, the
    // once-only auto launch does not run again, and a cleared timer would leave the spinner up for
    // good. A timer firing after a real unmount only sets state React discards.
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const stopWatchingRef = useRef<(() => void) | null>(null);

    const showAppConfirmDialog = useCallback(() => {
        setDialogType('app-confirm');
    }, []);

    const closeDialog = useCallback(() => {
        setDialogType(null);
        setState('initial');
    }, []);

    const { fullPath } = deepLinkInfo;

    /**
     * @param fallbackUrl - where Android goes when the package is missing (ignored on iOS)
     * @param appMissing - read after the timeout; true means the store dialog is the right answer
     */
    const launch = useCallback(
        (fallbackUrl: string, appMissing: () => boolean) => {
            const launchUrl = buildAppLaunchUrl(deviceType, fullPath, APP_CONFIG, fallbackUrl);
            if (!launchUrl) return;

            setDialogType(null);
            setState('launching');

            // Opening the app sends this page to the background. If that happened, the launch worked
            // and offering the store on the way back would tell someone who has the app to install it.
            stopWatchingRef.current?.();
            let leftForApp = false;
            const onVisibilityChange = () => {
                if (document.visibilityState === 'hidden') leftForApp = true;
            };
            document.addEventListener('visibilitychange', onVisibilityChange);
            stopWatchingRef.current = () => document.removeEventListener('visibilitychange', onVisibilityChange);

            openUrl(launchUrl);

            if (timerRef.current) clearTimeout(timerRef.current);
            timerRef.current = setTimeout(() => {
                stopWatchingRef.current?.();
                stopWatchingRef.current = null;
                setState('initial');
                if (!leftForApp && appMissing()) setDialogType('store-confirm');
            }, DEEPLINK_CONFIG.launchTimeout);
        },
        [deviceType, fullPath]
    );

    const confirmLaunchApp = useCallback(async () => {
        // A tap is an explicit request for the app, so a missing package goes straight to the store,
        // and a page still showing after the timeout is the only sign the app is missing on iOS.
        launch(APP_CONFIG.storeUrls.android, () => true);
    }, [launch]);

    useEffect(() => {
        if (!autoLaunch || autoLaunchedRef.current) return;
        autoLaunchedRef.current = true;
        // Nobody asked for the store yet, so a missing package comes back here, marked so it does
        // not launch again, and the user still gets the choice between the store and the web.
        //
        // On Android the marker is also the only reliable "app missing" signal: a page still showing
        // can equally mean the browser declined to open the app, and someone who has it should then
        // get the buttons, not an install prompt. iOS has no fallback, so there the visible page is it.
        const appMissing = deviceType === 'android' ? () => window.location.hash === APP_MISSING_HASH : () => true;
        launch(`${window.location.origin}${fullPath}${APP_MISSING_HASH}`, appMissing);
    }, [autoLaunch, launch, fullPath, deviceType]);

    const confirmGoToStore = useCallback(() => {
        setDialogType(null);
        const storeUrl = deviceType === 'ios' ? APP_CONFIG.storeUrls.ios : APP_CONFIG.storeUrls.android;
        openUrl(storeUrl);
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
