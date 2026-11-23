import { useState, useCallback, useEffect, useRef } from 'react';

import { APP_CONFIG, DEEPLINK_CONFIG } from '../consts';
import { APP_MISSING_HASH, buildAppLaunchUrl, openUrl } from '../utils';

import type { DeviceType } from '../../../hooks';
import type { DeepLinkState, DeepLinkInfo, DialogType } from '../types';

interface UseAppLauncherProps {
    deviceType: DeviceType;
    deepLinkInfo: DeepLinkInfo;
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

export const useAppLauncher = ({ deviceType, deepLinkInfo, autoLaunch }: UseAppLauncherProps): UseAppLauncherReturn => {
    const [state, setState] = useState<DeepLinkState>(deviceType === 'desktop' ? 'desktop' : 'initial');
    const [dialogType, setDialogType] = useState<DialogType>(null);
    const autoLaunchedRef = useRef(false);
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

    const launch = useCallback(
        (fallbackUrl: string, appMissing: () => boolean) => {
            const launchUrl = buildAppLaunchUrl(deviceType, fullPath, APP_CONFIG, fallbackUrl);
            if (!launchUrl) return;

            setDialogType(null);
            setState('launching');

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
        launch(APP_CONFIG.storeUrls.android, () => true);
    }, [launch]);

    useEffect(() => {
        if (!autoLaunch || autoLaunchedRef.current) return;
        autoLaunchedRef.current = true;
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
