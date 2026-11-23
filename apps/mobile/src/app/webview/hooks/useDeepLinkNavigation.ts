import { useCallback, useEffect, useState } from 'react';

import { deeplinkService, logger, notificationService, subWebViewService } from '../../services';
import { isChannelRoomPath } from '../../services/deeplinks/isChannelRoomPath';
import type { NativeRouteState, PushNavigationData } from '../../services/deeplinks/deeplinkUtils';
import { navigationRef } from '../../features/core/navigation/navigationRef';
import type { IAppBridgeHost } from '@chatic/bridges';
import type { HandedOverPerfTrace } from '@chatic/bridge-messages';
import { startPerfTrace } from '@chatic/perf';

export interface UseDeepLinkNavigationResult {
    deepLinkError: boolean;
    deepLinkErrorReason: string | null;
    handleDismissError: () => void;
}

const NATIVE_ROUTE_RETRY_MS = 250;
const MAX_NATIVE_ROUTE_ATTEMPTS = 8;

export const useDeepLinkNavigation = (
    bridge: IAppBridgeHost | undefined,
    { skipColdStart = false }: { skipColdStart?: boolean } = {}
): UseDeepLinkNavigationResult => {
    const [deepLinkError, setDeepLinkError] = useState(false);
    const [deepLinkErrorReason, setDeepLinkErrorReason] = useState<string | null>(null);

    const handleDismissError = useCallback(() => {
        setDeepLinkError(false);
        setDeepLinkErrorReason(null);
    }, []);

    useEffect(() => {
        if (!bridge) return;

        let disposed = false;
        let coldStartNavigated = false;
        let nativeRetryTimer: ReturnType<typeof setTimeout> | undefined;

        const closeSubWebView = () => {
            const view = subWebViewService.current();
            if (view) subWebViewService.close(view.viewId, 'system');
        };

        const emitNavigate = (path: string, perfTrace?: HandedOverPerfTrace) => {
            closeSubWebView();
            logger.info('DEEPLINK', `[useDeepLinkNavigation] OnNavigate → ${path}`);
            bridge.pushEvent<'OnNavigate'>({
                type: 'OnNavigate',
                success: true,
                data: { path, replace: false, ...(perfTrace ? { perfTrace } : {}) },
            });
        };

        const handOverRoomOpenTrace = (
            path: string,
            entry: HandedOverPerfTrace['entry'],
            coldStart: boolean
        ): HandedOverPerfTrace | undefined => {
            if (!isChannelRoomPath(path)) return undefined;
            const trace = startPerfTrace('chat_room_open');
            const sync = startPerfTrace('chat_room_sync');
            return { id: trace.id, syncId: sync.id, startedAt: Date.now(), entry, coldStart };
        };

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
            closeSubWebView();
            try {
                navigationRef.reset(state as Parameters<typeof navigationRef.reset>[0]);
            } catch (err) {
                logger.error('DEEPLINK', '[useDeepLinkNavigation] Failed to apply native route', err);
            }
        };

        const dispatchDeepLink = (url: string, isColdStart: boolean) => {
            const resolution = deeplinkService.resolveInbound(url);
            if (resolution.kind === 'invalid') {
                logger.warn('DEEPLINK', `[useDeepLinkNavigation] Invalid deep link dropped: ${resolution.error}`);
                setDeepLinkError(true);
                setDeepLinkErrorReason(resolution.error);
                return;
            }
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

        const dispatchPushTap = (data: PushNavigationData | undefined, isColdStart: boolean, messageId?: string) => {
            const path = deeplinkService.resolvePushTap(data);
            logger.info('PUSH_EVENT', 'push tapped', {
                messageId,
                coldStart: isColdStart,
                resolved: !!path,
            });
            if (!path) {
                logger.warn(
                    'DEEPLINK',
                    `[useDeepLinkNavigation] Push tap resolved to no path (coldStart=${isColdStart}, keys=${
                        data ? Object.keys(data).join(',') : 'none'
                    })`
                );
                return;
            }
            if (isColdStart) {
                if (coldStartNavigated) {
                    logger.info('DEEPLINK', '[useDeepLinkNavigation] Duplicate cold-start navigation dropped');
                    return;
                }
                coldStartNavigated = true;
            }
            emitNavigate(path, handOverRoomOpenTrace(path, 'push_tap', isColdStart));
        };

        if (!skipColdStart) {
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
        }

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
    }, [bridge, skipColdStart]);

    return { deepLinkError, deepLinkErrorReason, handleDismissError };
};
