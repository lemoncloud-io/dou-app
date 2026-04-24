import { useEffect } from 'react';

import { useSplashStore } from '@chatic/web-core';

declare global {
    interface Window {
        __splash?: { animDone: boolean; appReady: boolean };
        __tryRemoveSplash?: () => void;
    }
}

interface SplashOverlayProps {
    isAppReady: boolean;
}

/**
 * Signals the HTML splash screen (in index.html) that the app is ready.
 * The actual Lottie animation runs in index.html before React loads.
 * This component just tells it when to fade out, and marks splash as shown for the session.
 */
export const SplashOverlay = ({ isAppReady }: SplashOverlayProps) => {
    const { isShown, markAsShown } = useSplashStore();

    useEffect(() => {
        if (!isAppReady || isShown) return;

        if (window.__splash) {
            window.__splash.appReady = true;
            window.__tryRemoveSplash?.();
        }
        markAsShown();
    }, [isAppReady, isShown, markAsShown]);

    return null;
};
