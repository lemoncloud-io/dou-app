import { useCallback, useEffect, useRef, useState } from 'react';

import { deeplinkService, logger, notificationService } from '../../services';
import type { NativeRouteState, PushNavigationData } from '../../services/deeplinks/deeplinkUtils';
import { navigationRef } from '../../features/core/navigation';
import type { IAppBridgeHost } from '@chatic/bridges';

// Delay before lifting the cold-start splash after the WebView reports load: keeps the "home" frame
// hidden until the buffered OnNavigate has applied, avoiding a flash on cold-start deep links.
const COLD_START_SPLASH_CLEAR_MS = 300;

export interface UseDeepLinkNavigationResult {
    deepLinkError: boolean;
    deepLinkErrorReason: string | null;
    handleDismissError: () => void;
    /** True while a cold-start deep link/tap is redirecting; keeps the splash up to avoid a home flash. */
    isRedirecting: boolean;
    /** WebView onLoad hook: clears the cold-start splash shortly after the page loads. */
    handleWebViewLoad: () => void;
}

/**
 * Single owner of inbound navigation into the WebView. Captures OS deep links / invite links (via
 * the deeplink service) and notification taps, resolves each to a routing decision, and converges
 * them onto one OnNavigate bridge event (web routes) or navigationRef (native routes). Push delivery
 * (useFcmHandler) is left with foreground receipt only.
 *
 * The bridge buffers OnNavigate until WebAppReady, so cold-start links/taps are delivered as soon as
 * the web handshake lands — no startup delay is needed.
 *
 * @param bridge
 */
export const useDeepLinkNavigation = (bridge: IAppBridgeHost | undefined): UseDeepLinkNavigationResult => {
    const [deepLinkError, setDeepLinkError] = useState(false);
    const [deepLinkErrorReason, setDeepLinkErrorReason] = useState<string | null>(null);
    const [isRedirecting, setIsRedirecting] = useState(false);

    // Cold-start splash coordination. Cold-start capture is async, so refs guard the race between it
    // and the (possibly earlier) WebView load event.
    const webViewLoadedRef = useRef(false);
    const pendingColdStartRedirectRef = useRef(false);

    const handleWebViewLoad = useCallback(() => {
        webViewLoadedRef.current = true;
        if (pendingColdStartRedirectRef.current) {
            pendingColdStartRedirectRef.current = false;
            setTimeout(() => setIsRedirecting(false), COLD_START_SPLASH_CLEAR_MS);
        }
    }, []);

    const handleDismissError = useCallback(() => {
        setDeepLinkError(false);
        setDeepLinkErrorReason(null);
    }, []);

    useEffect(() => {
        if (!bridge) return;

        // Guards against dispatching a captured cold-start intent after the hook unmounts.
        let disposed = false;

        // Emit a WEBVIEW_URL-relative path to the web. Shared by every inbound navigation source.
        const emitNavigate = (path: string) => {
            logger.info('DEEPLINK', `[useDeepLinkNavigation] OnNavigate → ${path}`);
            bridge.pushEvent<'OnNavigate'>({
                type: 'OnNavigate',
                success: true,
                data: { path, replace: false },
            });
        };

        // Keep the splash up for a cold-start redirect. If the WebView already loaded, the splash
        // would no longer help, so skip it.
        const markColdStartRedirect = () => {
            if (webViewLoadedRef.current) return;
            pendingColdStartRedirectRef.current = true;
            setIsRedirecting(true);
        };

        // Apply a native (target=native) route imperatively. Web routes never reach here. Note the
        // Debug/Modal screens are not currently registered in the navigator, so this mirrors the prior
        // (linking-driven) behavior for those routes rather than introducing new navigation.
        const applyNativeRoute = (state: NativeRouteState) => {
            if (!navigationRef.isReady()) {
                logger.warn('DEEPLINK', '[useDeepLinkNavigation] navigationRef not ready for native route');
                return;
            }
            try {
                navigationRef.reset(state as Parameters<typeof navigationRef.reset>[0]);
            } catch (err) {
                logger.error('DEEPLINK', '[useDeepLinkNavigation] Failed to apply native route', err);
            }
        };

        // Resolve an OS deep link / invite link and route it. `isColdStart` drives the splash.
        const dispatchDeepLink = (url: string, isColdStart: boolean) => {
            const resolution = deeplinkService.resolveInbound(url);
            if (resolution.kind === 'invalid') {
                logger.warn('DEEPLINK', `[useDeepLinkNavigation] Invalid deep link dropped: ${resolution.error}`);
                setDeepLinkError(true);
                setDeepLinkErrorReason(resolution.error);
                return;
            }
            if (resolution.kind === 'native') {
                applyNativeRoute(resolution.state);
                return;
            }
            if (isColdStart) markColdStartRedirect();
            emitNavigate(resolution.path);
        };

        // Notification tap → relative path (cid/sid merged). A null path just foregrounds the app.
        const dispatchPushTap = (data: PushNavigationData | undefined, isColdStart: boolean) => {
            const path = deeplinkService.resolvePushTap(data);
            if (!path) {
                // A tap that resolves to nothing is otherwise invisible in field diagnostics; log the
                // payload shape (keys only, no content) so a schema mismatch can be spotted from logs.
                logger.warn(
                    'DEEPLINK',
                    `[useDeepLinkNavigation] Push tap resolved to no path (coldStart=${isColdStart}, keys=${
                        data ? Object.keys(data).join(',') : 'none'
                    })`
                );
                return;
            }
            if (isColdStart) markColdStartRedirect();
            emitNavigate(path);
        };

        // --- Cold start capture (app launched by a deep link or a notification tap) ---
        deeplinkService.getInitialUrl().then(url => {
            if (!disposed && url) dispatchDeepLink(url, true);
        });
        notificationService.getInitialNotification().then(remoteMessage => {
            if (!disposed && remoteMessage) {
                dispatchPushTap(remoteMessage.data as PushNavigationData | undefined, true);
            }
        });

        // --- Warm capture (deep link / tap arriving while the app is already running) ---
        const unsubscribeDeepLink = deeplinkService.subscribe(url => {
            dispatchDeepLink(url, false);
        });
        const unsubscribeOnOpened = notificationService.onNotificationOpenedApp(remoteMessage => {
            dispatchPushTap(remoteMessage.data as PushNavigationData | undefined, false);
        });

        return () => {
            disposed = true;
            unsubscribeDeepLink();
            unsubscribeOnOpened();
        };
    }, [bridge]);

    return { deepLinkError, deepLinkErrorReason, handleDismissError, isRedirecting, handleWebViewLoad };
};
