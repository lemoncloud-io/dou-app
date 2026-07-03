import { useCallback, useEffect } from 'react';
import { DeviceEventEmitter, Platform } from 'react-native';
import { logger, notificationService, pushEventManager } from '../../services';
import { resolvePushPath, type PushNavigationData } from './resolvePushPath';
import type { IAppBridgeHost } from '@chatic/bridges';
import type { WebMessageData } from '@chatic/app-messages';

/**
 * Hook that integrates FCM push notifications, badge counts, and deep link routing inside the WebView.
 * Handles FetchFcmToken, FetchBadgeCount, and SetBadgeCount requests from the Web,
 * and orchestrates native notification click/receive flows.
 *
 * @param bridge
 */
export const useFcmHandler = (bridge: IAppBridgeHost) => {
    const fetchFcmToken = useCallback(async (_message: WebMessageData<'FetchFcmToken'>) => {
        try {
            const hasPermission = await notificationService.requestPermission();

            if (hasPermission) {
                let token;
                if (Platform.OS === 'ios') {
                    await notificationService.registerAPNs();
                    token = await notificationService.getAPNSToken();
                } else {
                    token = await notificationService.getToken();
                }

                if (token) {
                    logger.debug('NOTIFICATION', 'Success set token.' + token);
                    return { type: 'OnFetchFcmToken' as const, success: true, data: { token } };
                } else {
                    throw new Error('Failed to generate FCM Token');
                }
            } else {
                logger.error('NOTIFICATION', 'Allow not notification permission.');
                throw new Error('Notification permission denied.');
            }
        } catch (e: any) {
            logger.error('NOTIFICATION', 'Set FCM token error.', e);
            return {
                type: 'OnFetchFcmToken' as const,
                success: false,
                error: { code: 'FCM_ERROR', message: e.message },
            };
        }
    }, []);

    const handleFetchBadgeCount = useCallback(async (_message: WebMessageData<'FetchBadgeCount'>) => {
        try {
            const count = await notificationService.getBadgeCount();
            return {
                type: 'OnFetchBadgeCount' as const,
                success: true,
                data: { count },
            };
        } catch (e: any) {
            logger.error('NOTIFICATION', 'Fetch badge count error.', e);
            return {
                type: 'OnFetchBadgeCount' as const,
                success: false,
                error: { code: 'BADGE_ERROR', message: e.message },
            };
        }
    }, []);

    const handleSetBadgeCount = useCallback(async (message: WebMessageData<'SetBadgeCount'>) => {
        try {
            const { count } = message.data;
            await notificationService.setBadgeCount(count);
            return {
                type: 'OnSetBadgeCount' as const,
                success: true,
                data: { success: true },
            };
        } catch (e: any) {
            logger.error('NOTIFICATION', 'Set badge count error.', e);
            return {
                type: 'OnSetBadgeCount' as const,
                success: false,
                error: { code: 'BADGE_ERROR', message: e.message },
            };
        }
    }, []);

    useEffect(() => {
        if (!bridge) return;

        // Bridge subscriber for OnReceiveNotification events via PushEventManager
        const unsubscribeReceive = pushEventManager.onReceiveNotification(remoteMessage => {
            bridge.pushEvent<'OnReceiveNotification'>({
                type: 'OnReceiveNotification',
                success: true,
                data: {
                    notification: {
                        title: remoteMessage.notification?.title,
                        body: remoteMessage.notification?.body,
                        data: remoteMessage.data,
                    },
                },
            });
        });

        // Foreground notification reception from OS -> emit to our PushEventManager
        const unsubscribeOnMessage = notificationService.onMessage(async remoteMessage => {
            pushEventManager.emitReceiveNotification(remoteMessage);
        });

        // Android native foreground push listener
        const foregroundPushSubscription = DeviceEventEmitter.addListener('onForegroundPushReceived', event => {
            logger.info('NOTIFICATION', 'Received Android native foreground push event:', event);
            try {
                const customData = event.payload ? JSON.parse(event.payload) : {};
                const remoteMessage = {
                    messageId: event.messageId,
                    sentTime: Number(event.timestamp) || Date.now(),
                    notification: {
                        title: event.title,
                        body: event.body,
                    },
                    data: {
                        ...customData,
                        id: event.messageId,
                        messageId: event.messageId,
                        type: event.type,
                        link: event.clickAction,
                        clickAction: event.clickAction,
                        channel_id: event.channelId,
                        channelId: event.channelId,
                        timestamp: event.timestamp,
                    },
                };
                pushEventManager.emitReceiveNotification(remoteMessage as any);
            } catch (err) {
                logger.error('NOTIFICATION', 'Error processing native foreground push event:', err);
            }
        });

        // Resolve a WebView-relative path (with cid/sid merged from payload) and push it straight to
        // the web via the bridge. This replaces the old Linking.openURL round-trip: the bridge already
        // buffers events until WebAppReady, so cold-start taps are delivered once the handshake lands.
        const routeNotification = (data: Record<string, string | object> | undefined) => {
            const path = resolvePushPath(data as PushNavigationData | undefined);
            if (!path) return;

            logger.info('NOTIFICATION', `[useFcmHandler] Routing notification tap via OnNavigate: ${path}`);
            bridge.pushEvent<'OnNavigate'>({
                type: 'OnNavigate',
                success: true,
                data: { path, replace: false },
            });
        };

        // App background notification click -> forward to web via OnNavigate
        const unsubscribeOnOpened = notificationService.onNotificationOpenedApp(remoteMessage => {
            routeNotification(remoteMessage.data);
        });

        // App killed (cold start) notification click -> forward to web via OnNavigate.
        // No startup delay needed: the bridge buffers the event until the web handshake completes.
        notificationService.getInitialNotification().then(remoteMessage => {
            if (remoteMessage) {
                routeNotification(remoteMessage.data);
            }
        });

        return () => {
            unsubscribeReceive();
            unsubscribeOnMessage();
            foregroundPushSubscription.remove();
            unsubscribeOnOpened();
        };
    }, [bridge]);

    return { fetchFcmToken, handleFetchBadgeCount, handleSetBadgeCount };
};
