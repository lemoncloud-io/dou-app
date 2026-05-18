import { useCallback, useEffect } from 'react';
import { Platform } from 'react-native';

import { logger, provider } from '../../services';

import type { WebViewBridge } from './useBaseBridge';
import type { AppMessageData } from '@chatic/app-messages';

/**
 * 웹뷰에서 FCM 기능을 사용하기 위한 핸들러 훅
 * @param bridge
 */
export const useFcmHandler = (bridge: WebViewBridge) => {
    const fetchFcmToken = useCallback(async () => {
        try {
            const hasPermission = await provider.notificationService.requestPermission();

            if (hasPermission) {
                let token;
                if (Platform.OS === 'ios') {
                    await provider.notificationService.registerAPNs();
                    token = await provider.notificationService.getAPNSToken();
                } else {
                    token = await provider.notificationService.getToken();
                }

                if (token) {
                    const message: AppMessageData<'OnFetchFcmToken'> = {
                        type: 'OnFetchFcmToken',
                        data: { token },
                    };
                    bridge.post(message);
                    logger.debug('NOTIFICATION', 'Success set token.' + token);
                }
            } else {
                logger.error('NOTIFICATION', 'Allow not notification permission.');
            }
        } catch (e: any) {
            logger.error('NOTIFICATION', 'Set FCM token error.', e);
        }
    }, [bridge]);

    useEffect(() => {
        // 포그라운드 알림 수신
        const unsubscribeOnMessage = provider.notificationService.onMessage(async remoteMessage => {
            const message: AppMessageData<'OnReceiveNotification'> = {
                type: 'OnReceiveNotification',
                data: {
                    notification: {
                        title: remoteMessage.notification?.title,
                        body: remoteMessage.notification?.body,
                        data: remoteMessage.data,
                    },
                },
            };
            bridge.post(message);
        });

        // 앱 백그라운드 상태에서 알림 클릭
        const unsubscribeOnOpened = provider.notificationService.onNotificationOpenedApp(remoteMessage => {
            const message: AppMessageData<'OnOpenNotification'> = {
                type: 'OnOpenNotification',
                data: remoteMessage.data || {},
            };
            bridge.post(message);
        });

        // 앱 종료 상태에서 알림 클릭 (Cold Start)
        provider.notificationService.getInitialNotification().then(remoteMessage => {
            if (remoteMessage) {
                /**
                 * TODO: Handle initial notification when webview is ready
                 * @author dev@example.com
                 */
                setTimeout(() => {
                    const message: AppMessageData<'OnOpenNotification'> = {
                        type: 'OnOpenNotification',
                        data: {
                            notification: remoteMessage.data || {},
                        },
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

    return { fetchFcmToken };
};
