import { useState, useCallback, useRef, useEffect } from 'react';

import { APP_CONFIG, DEEPLINK_CONFIG } from '../constants';
import type { DeviceType, DeepLinkState, DeepLinkInfo } from '../types';
import { storeDeferredDeepLink } from '../utils';

interface UseAppLauncherProps {
    deviceType: DeviceType;
    deepLinkInfo: DeepLinkInfo;
}

interface UseAppLauncherReturn {
    state: DeepLinkState;
    launchApp: () => void;
}

export const useAppLauncher = ({ deviceType, deepLinkInfo }: UseAppLauncherProps): UseAppLauncherReturn => {
    const [state, setState] = useState<DeepLinkState>(deviceType === 'desktop' ? 'desktop' : 'initial');
    const appOpenedRef = useRef(false);

    useEffect(() => {
        if (deviceType === 'desktop') {
            setState('desktop');
        }
    }, [deviceType]);

    const launchApp = useCallback(() => {
        if (deviceType === 'desktop') return;

        setState('launching');
        appOpenedRef.current = false;

        const blurHandler = () => {
            appOpenedRef.current = true;
            console.log('[App] Opened via blur event');
        };

        const visibilityHandler = () => {
            if (document.hidden) {
                appOpenedRef.current = true;
                console.log('[App] Opened via visibility change');
            }
        };

        window.addEventListener('blur', blurHandler);
        window.addEventListener('visibilitychange', visibilityHandler);

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

        setTimeout(async () => {
            window.removeEventListener('blur', blurHandler);
            window.removeEventListener('visibilitychange', visibilityHandler);

            if (!appOpenedRef.current) {
                console.log(`[${deviceType}] App not opened, storing deferred link`);
                await storeDeferredDeepLink(deepLinkInfo.deepLinkUrl);
            }

            setState('store');
        }, DEEPLINK_CONFIG.launchTimeout);
    }, [deviceType, deepLinkInfo]);

    return { state, launchApp };
};
