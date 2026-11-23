import { useCallback, useEffect } from 'react';
import { DeviceEventEmitter, Platform } from 'react-native';
import { logger, notificationService, pushEventManager } from '../../services';
import { BadgeSyncBridge, PushMarksBridge } from '../../bridge';
import { acquirePushToken } from '../../services/notification/pushToken';
import type { IAppBridgeHost } from '@chatic/bridges';
import type { WebMessageData } from '@chatic/bridge-messages';

export const useFcmHandler = (bridge: IAppBridgeHost) => {
    const fetchFcmToken = useCallback(async (_message: WebMessageData<'FetchFcmToken'>) => {
        try {
            const token = await acquirePushToken(notificationService, Platform.OS);
            logger.info('NOTIFICATION', 'push token acquired', { platform: Platform.OS });
            return { type: 'OnFetchFcmToken' as const, success: true, data: { token } };
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

    const handleFetchBadgeBase = useCallback(async (_message: WebMessageData<'FetchBadgeBase'>) => {
        try {
            const base = await BadgeSyncBridge.getBase();
            return { type: 'OnFetchBadgeBase' as const, success: true, data: { base } };
        } catch (e: any) {
            logger.error('NOTIFICATION', 'Fetch badge base error.', e);
            return {
                type: 'OnFetchBadgeBase' as const,
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

        const unsubscribeReceive = pushEventManager.onReceiveNotification(remoteMessage => {
            bridge.pushEvent<'OnReceiveNotification'>({
                type: 'OnReceiveNotification',
                success: true,
                data: {
                    notification: {
                        title: remoteMessage.notification?.title,
                        body: remoteMessage.notification?.body,
                        data: { messageId: remoteMessage.messageId, ...remoteMessage.data },
                    },
                },
            });
        });

        const unsubscribeOnMessage = notificationService.onMessage(async remoteMessage => {
            pushEventManager.emitReceiveNotification(remoteMessage);
        });

        const foregroundPushSubscription = DeviceEventEmitter.addListener('onForegroundPushReceived', event => {
            logger.info('PUSH_EVENT', 'foreground push relayed to web', {
                messageId: event.messageId,
                channelId: event.channelId,
                type: event.type,
            });
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
                        ...(event.data ?? {}),
                        ...customData,
                        id: event.messageId,
                        messageId: event.messageId,
                        type: event.type,
                        link: event.clickAction,
                        clickAction: event.clickAction,
                        channel_id: event.channelId,
                        notificationChannelId: event.channelId,
                        timestamp: event.timestamp,
                        payload: event.payload,
                    },
                };
                pushEventManager.emitReceiveNotification(remoteMessage as any);
            } catch (err) {
                logger.error('NOTIFICATION', 'Error processing native foreground push event:', err);
            }
        });

        return () => {
            unsubscribeReceive();
            unsubscribeOnMessage();
            foregroundPushSubscription.remove();
        };
    }, [bridge]);

    const handleDeleteFcmToken = useCallback(async (_message: WebMessageData<'DeleteFcmToken'>) => {
        await notificationService.deleteToken();
        logger.debug('NOTIFICATION', 'FCM token deleted on web request');
        return { type: 'OnDeleteFcmToken' as const, success: true, data: { success: true } };
    }, []);

    return {
        fetchFcmToken,
        handleDeleteFcmToken,
        handleFetchBadgeCount,
        handleFetchBadgeBase,
        handleSetBadgeCount,
        handleFetchPushMarks,
    };
};
