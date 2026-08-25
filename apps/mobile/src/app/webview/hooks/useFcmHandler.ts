import { useCallback, useEffect } from 'react';
import { DeviceEventEmitter, Platform } from 'react-native';
import { logger, notificationService, pushEventManager } from '../../services';
import { PushMarksBridge } from '../../bridge';
import type { IAppBridgeHost } from '@chatic/bridges';
import type { WebMessageData } from '@chatic/app-messages';

/**
 * Hook that integrates FCM foreground push and badge/token bridge requests inside the WebView.
 * Handles FetchFcmToken, FetchBadgeCount, SetBadgeCount, and FetchPushMarks requests from the Web,
 * and forwards foreground push receipts to the web as OnReceiveNotification (via PushEventManager).
 *
 * Notification-tap navigation is intentionally NOT handled here — it lives in useDeepLinkNavigation
 * so taps and deep links converge on a single OnNavigate owner. Push keeps foreground receipt only.
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

    const handleFetchPushMarks = useCallback(async (_message: WebMessageData<'FetchPushMarks'>) => {
        try {
            const marks = await PushMarksBridge.drain();
            return {
                type: 'OnFetchPushMarks' as const,
                success: true,
                data: { marks },
            };
        } catch (e: any) {
            logger.error('NOTIFICATION', 'Fetch push marks error.', e);
            return {
                type: 'OnFetchPushMarks' as const,
                success: false,
                error: { code: 'PUSH_MARKS_ERROR', message: e.message },
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
                // The FCM payload verbatim (`event.data`), then the fields nested in its `payload`
                // JSON on top — the nested copy is the authoritative one for `channelId`/`ownerId`,
                // which is what the web suppresses its in-app banner on.
                const customData = event.payload ? JSON.parse(event.payload) : {};
                const remoteMessage = {
                    messageId: event.messageId,
                    sentTime: Number(event.timestamp) || Date.now(),
                    notification: {
                        title: event.title,
                        body: event.body,
                    },
                    data: {
                        ...(event.data ?? {}),
                        ...customData,
                        id: event.messageId,
                        messageId: event.messageId,
                        type: event.type,
                        link: event.clickAction,
                        clickAction: event.clickAction,
                        // The OS NOTIFICATION channel ("dou_chat"), never the chat channel. Writing
                        // it to `channelId` (as this used to) hid the real chat id from the web, so
                        // its "am I already reading this room?" check could never match.
                        channel_id: event.channelId,
                        notificationChannelId: event.channelId,
                        timestamp: event.timestamp,
                        // Kept raw so the web can merge it itself — that merge is what keeps the
                        // suppression working on app builds older than this one.
                        payload: event.payload,
                    },
                };
                pushEventManager.emitReceiveNotification(remoteMessage as any);
            } catch (err) {
                logger.error('NOTIFICATION', 'Error processing native foreground push event:', err);
            }
        });

        // Notification-tap navigation (onNotificationOpenedApp / getInitialNotification) is owned by
        // useDeepLinkNavigation. This hook only forwards foreground receipts as OnReceiveNotification.

        return () => {
            unsubscribeReceive();
            unsubscribeOnMessage();
            foregroundPushSubscription.remove();
        };
    }, [bridge]);

    return { fetchFcmToken, handleFetchBadgeCount, handleSetBadgeCount, handleFetchPushMarks };
};
