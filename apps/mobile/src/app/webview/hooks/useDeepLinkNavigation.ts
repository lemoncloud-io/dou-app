import { useCallback, useEffect, useState } from 'react';

import { deeplinkService, logger, notificationService } from '../../services';
// A leaf module: deeplinkUtils reaches react-native-config, which a unit test cannot load.
import { isChannelRoomPath } from '../../services/deeplinks/isChannelRoomPath';
import type { NativeRouteState, PushNavigationData } from '../../services/deeplinks/deeplinkUtils';
// Imported from the leaf module, not the navigation barrel: the barrel re-exports RootNavigator,
// which pulls the whole navigator graph (and @react-navigation's ESM) into anything that only needs
// the ref. That is the coupling navigationRef.ts was split out to avoid.
import { navigationRef } from '../../features/core/navigation/navigationRef';
import type { IAppBridgeHost } from '@chatic/bridges';
import type { HandedOverPerfTrace } from '@chatic/app-messages';
import { startPerfTrace } from '@chatic/perf';

export interface UseDeepLinkNavigationResult {
    deepLinkError: boolean;
    deepLinkErrorReason: string | null;
    handleDismissError: () => void;
}

// A cold-start native link can arrive before the navigator mounts: retry for ~2s rather than
// drop it. Web routes need nothing like this — the bridge buffers OnNavigate until WebAppReady.
const NATIVE_ROUTE_RETRY_MS = 250;
const MAX_NATIVE_ROUTE_ATTEMPTS = 8;

/**
 * Single owner of inbound navigation into the WebView. Captures OS deep links / invite links (via
 * the deeplink service) and notification taps, resolves each to a routing decision, and converges
 * them onto one OnNavigate bridge event (web routes) or navigationRef (native routes). Push delivery
 * (useFcmHandler) is left with foreground receipt only.
 *
 * The bridge buffers OnNavigate until WebAppReady, so cold-start links/taps are delivered as soon as
 * the web handshake lands — no startup delay is needed. Hiding home while a cold-start link applies is
 * not this hook's job any more: the web holds its boot cover (and so the launch splash) until the
 * replayed navigation has rendered.
 *
 * @param bridge
 */
export const useDeepLinkNavigation = (bridge: IAppBridgeHost | undefined): UseDeepLinkNavigationResult => {
    const [deepLinkError, setDeepLinkError] = useState(false);
    const [deepLinkErrorReason, setDeepLinkErrorReason] = useState<string | null>(null);

    const handleDismissError = useCallback(() => {
        setDeepLinkError(false);
        setDeepLinkErrorReason(null);
    }, []);

    useEffect(() => {
        if (!bridge) return;

        // Guards against dispatching a captured cold-start intent after the hook unmounts.
        let disposed = false;
        // A cold start is launched by ONE intent, but both lookups can answer: a push tap carries
        // the same link the OS deep link lookup reports. The first navigation wins; the second is
        // a duplicate that would push the room twice.
        let coldStartNavigated = false;
        // A queued native route's retry timer, so unmount cancels it.
        let nativeRetryTimer: ReturnType<typeof setTimeout> | undefined;

        // Emit a WEBVIEW_URL-relative path to the web. Shared by every inbound navigation source.
        const emitNavigate = (path: string, perfTrace?: HandedOverPerfTrace) => {
            logger.info('DEEPLINK', `[useDeepLinkNavigation] OnNavigate → ${path}`);
            bridge.pushEvent<'OnNavigate'>({
                type: 'OnNavigate',
                success: true,
                data: { path, replace: false, ...(perfTrace ? { perfTrace } : {}) },
            });
        };

        // Opens the room-open trace as soon as the tap reaches JS, so it covers what the user waits
        // through from there — the WebView handshake, the router gate, a switch — and not only what
        // the web can see. On a cold start that is after this runtime and the WebView have come up;
        // the launch before it is the `boot` trace's. The web adopts the trace by id and stops it
        // when the room draws. Only a room navigation starts one: nothing else would ever stop it.
        const handOverRoomOpenTrace = (
            path: string,
            entry: HandedOverPerfTrace['entry'],
            coldStart: boolean
        ): HandedOverPerfTrace | undefined => {
            if (!isChannelRoomPath(path)) return undefined;
            // Both room traces start here, together: `chat_room_sync` measures the same wait to the
            // point the room shows its synced, latest messages rather than whatever was cached.
            const trace = startPerfTrace('chat_room_open');
            const sync = startPerfTrace('chat_room_sync');
            return { id: trace.id, syncId: sync.id, startedAt: Date.now(), entry, coldStart };
        };

        // Apply a native (target=native) route imperatively. Web routes never reach here. Note the
        // Debug/Modal screens are not currently registered in the navigator, so this mirrors the prior
        // (linking-driven) behavior for those routes rather than introducing new navigation.
        // A cold-start link can arrive before the navigator mounts: retry briefly rather than drop
        // it, the way the bridge buffers OnNavigate until WebAppReady for web routes.
        const applyNativeRoute = (state: NativeRouteState, attempt = 0) => {
            if (disposed) return;
            if (!navigationRef.isReady()) {
                if (attempt >= MAX_NATIVE_ROUTE_ATTEMPTS) {
                    logger.warn('DEEPLINK', '[useDeepLinkNavigation] navigationRef never ready; native route dropped');
                    return;
                }
                nativeRetryTimer = setTimeout(() => applyNativeRoute(state, attempt + 1), NATIVE_ROUTE_RETRY_MS);
                return;
            }
            try {
                navigationRef.reset(state as Parameters<typeof navigationRef.reset>[0]);
            } catch (err) {
                logger.error('DEEPLINK', '[useDeepLinkNavigation] Failed to apply native route', err);
            }
        };

        // Resolve an OS deep link / invite link and route it. `isColdStart` is reported on the trace.
        const dispatchDeepLink = (url: string, isColdStart: boolean) => {
            const resolution = deeplinkService.resolveInbound(url);
            if (resolution.kind === 'invalid') {
                logger.warn('DEEPLINK', `[useDeepLinkNavigation] Invalid deep link dropped: ${resolution.error}`);
                setDeepLinkError(true);
                setDeepLinkErrorReason(resolution.error);
                return;
            }
            // An invalid link consumes nothing: the tap lookup may still hold the real intent.
            if (isColdStart) {
                if (coldStartNavigated) {
                    logger.info('DEEPLINK', '[useDeepLinkNavigation] Duplicate cold-start navigation dropped');
                    return;
                }
                coldStartNavigated = true;
            }
            if (resolution.kind === 'native') {
                applyNativeRoute(resolution.state);
                return;
            }
            emitNavigate(resolution.path, handOverRoomOpenTrace(resolution.path, 'deeplink', isColdStart));
        };

        // Notification tap → relative path (cid/sid merged). A null path just foregrounds the app.
        const dispatchPushTap = (data: PushNavigationData | undefined, isColdStart: boolean, messageId?: string) => {
            const path = deeplinkService.resolvePushTap(data);
            // The tap is the middle link of the push chain (ADR-0099): a cold start puts the receipt
            // and the room entry under different app runs, so `messageId` is what joins them. Logged
            // whether or not the path resolved — a tap that led nowhere is the interesting case.
            logger.info('PUSH_EVENT', 'push tapped', {
                messageId,
                coldStart: isColdStart,
                resolved: !!path,
            });
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
            // A tap that resolves to nothing consumes nothing: the link lookup may still deliver.
            if (isColdStart) {
                if (coldStartNavigated) {
                    logger.info('DEEPLINK', '[useDeepLinkNavigation] Duplicate cold-start navigation dropped');
                    return;
                }
                coldStartNavigated = true;
            }
            emitNavigate(path, handOverRoomOpenTrace(path, 'push_tap', isColdStart));
        };

        // --- Cold start capture (app launched by a deep link or a notification tap) ---
        // Either native lookup rejects on some OEM builds / a torn-down bridge; a rejection is
        // "no intent from this source", never a reason to break the other source.
        deeplinkService
            .getInitialUrl()
            .then(url => {
                if (!disposed && url) dispatchDeepLink(url, true);
            })
            .catch(err => {
                logger.warn('DEEPLINK', '[useDeepLinkNavigation] Cold-start link lookup failed', err);
            });
        notificationService
            .getInitialNotification()
            .then(remoteMessage => {
                if (!disposed && remoteMessage) {
                    dispatchPushTap(
                        remoteMessage.data as PushNavigationData | undefined,
                        true,
                        remoteMessage.messageId
                    );
                }
            })
            .catch(err => {
                logger.warn('DEEPLINK', '[useDeepLinkNavigation] Cold-start notification lookup failed', err);
            });

        // --- Warm capture (deep link / tap arriving while the app is already running) ---
        const unsubscribeDeepLink = deeplinkService.subscribe(url => {
            dispatchDeepLink(url, false);
        });
        const unsubscribeOnOpened = notificationService.onNotificationOpenedApp(remoteMessage => {
            dispatchPushTap(remoteMessage.data as PushNavigationData | undefined, false, remoteMessage.messageId);
        });

        return () => {
            disposed = true;
            if (nativeRetryTimer) clearTimeout(nativeRetryTimer);
            unsubscribeDeepLink();
            unsubscribeOnOpened();
        };
    }, [bridge]);

    return { deepLinkError, deepLinkErrorReason, handleDismissError };
};
