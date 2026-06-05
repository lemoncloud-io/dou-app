import { useCallback, useEffect } from 'react';
import { Platform } from 'react-native';
import { deeplinkService, logger, notificationService, pushEventManager } from '../../services';
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
            // 포그라운드 수신 시 페이로드에 뱃지 정보가 포함된 경우 네이티브 뱃지 갱신 ("badge": "5" 등)
            const rawBadge = remoteMessage.data?.badge;
            if (rawBadge !== undefined && rawBadge !== null) {
                const badgeCount = parseInt(String(rawBadge), 10);
                if (!isNaN(badgeCount)) {
                    notificationService.setBadgeCount(badgeCount).catch(e => {
                        logger.error('NOTIFICATION', 'Failed to set native badge in foreground:', e);
                    });
                }
            }
            pushEventManager.emitReceiveNotification(remoteMessage);
        });

        // Helper to extract and route URL from notification payload
        const routeNotification = (data: Record<string, string | object> | undefined) => {
            if (!data) return;
            const rawUrl = data.deeplink || data.url || data.link;
            if (typeof rawUrl === 'string' && rawUrl.trim().length > 0) {
                void deeplinkService.handleUrl(rawUrl);
            }
        };

        // App background notification click -> route via deeplinkService
        const unsubscribeOnOpened = notificationService.onNotificationOpenedApp(remoteMessage => {
            routeNotification(remoteMessage.data);
        });

        // App killed (Cold Start) notification click -> route via deeplinkService
        notificationService.getInitialNotification().then(remoteMessage => {
            if (remoteMessage) {
                // A brief delay to allow App state / DeepLinkManager to start up
                setTimeout(() => {
                    routeNotification(remoteMessage.data);
                }, 1000);
            }
        });

        return () => {
            unsubscribeReceive();
            unsubscribeOnMessage();
            unsubscribeOnOpened();
        };
    }, [bridge]);

    return { fetchFcmToken, handleFetchBadgeCount, handleSetBadgeCount };
};
