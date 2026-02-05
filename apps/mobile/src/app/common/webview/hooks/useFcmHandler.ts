import { useCallback, useEffect } from 'react';

import { FcmService, Logger } from '../../services';

import type { WebViewBridge } from './useBaseBridge';
import type { AppMessageData } from '@chatic/app-messages';

export const useFcmHandler = (bridge: WebViewBridge) => {
    const setFcmToken = useCallback(async () => {
        try {
            const hasPermission = await FcmService.requestPermission();

            if (hasPermission) {
                const token = await FcmService.getToken();

                if (token) {
                    const message: AppMessageData<'SetFcmToken'> = {
                        type: 'SetFcmToken',
                        data: { token },
                    };
                    bridge.post(message);
                    Logger.debug('FCM', 'Success set token.' + token);
                }
            } else {
                Logger.error('FCM', 'Allow not notification permission.');
            }
        } catch (e: any) {
            Logger.error('FCM', 'Set FCM token error.', e);
        }
    }, [bridge]);

    useEffect(() => {
        // 포그라운드 알림 수신
        const unsubscribeOnMessage = FcmService.onMessage(async remoteMessage => {
            const message: AppMessageData<'NotificationReceived'> = {
                type: 'NotificationReceived',
                data: {
                    title: remoteMessage.notification?.title,
                    body: remoteMessage.notification?.body,
                    data: remoteMessage.data,
                },
            };
            bridge.post(message);
        });

        // 앱 백그라운드 상태에서 알림 클릭
        const unsubscribeOnOpened = FcmService.onNotificationOpenedApp(remoteMessage => {
            const message: AppMessageData<'NotificationOpened'> = {
                type: 'NotificationOpened',
                data: remoteMessage.data || {},
            };
            bridge.post(message);
        });

        // 앱 종료 상태에서 알림 클릭 (Cold Start)
        FcmService.getInitialNotification().then(remoteMessage => {
            if (remoteMessage) {
                /**
                 * TODO: Handle initial notification when webview is ready
                 * @author raine@lemoncloud.io
                 */
                setTimeout(() => {
                    const message: AppMessageData<'NotificationOpened'> = {
                        type: 'NotificationOpened',
                        data: remoteMessage.data || {},
                    };
                    bridge.post(message);
                }, 1000);
            }
        });

        return () => {
            unsubscribeOnMessage();
            unsubscribeOnOpened();
        };
    }, [bridge]);

    return { setFcmToken };
};
