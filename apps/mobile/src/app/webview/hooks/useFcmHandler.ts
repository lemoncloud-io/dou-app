import { useCallback, useEffect } from 'react';
import { Platform } from 'react-native';

import { logger, provider } from '../../services';

import type { IAppBridgeHost } from '@chatic/bridges';
import type { FetchFcmToken } from '@chatic/app-messages';

/**
 * 웹뷰에서 FCM 기능을 사용하기 위한 핸들러 훅
 * @param bridge
 */
export const useFcmHandler = (bridge: IAppBridgeHost) => {
    const fetchFcmToken = useCallback(async (_message: FetchFcmToken): Promise<{ token: string }> => {
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
                    logger.debug('NOTIFICATION', 'Success set token.' + token);
                    return { token };
                } else {
                    throw new Error('Failed to generate FCM Token');
                }
            } else {
                logger.error('NOTIFICATION', 'Allow not notification permission.');
                throw new Error('Notification permission denied.');
            }
        } catch (e: any) {
            logger.error('NOTIFICATION', 'Set FCM token error.', e);
            throw e;
        }
    }, []);

    useEffect(() => {
        if (!bridge) return;

        // 포그라운드 알림 수신
        const unsubscribeOnMessage = provider.notificationService.onMessage(async remoteMessage => {
            bridge.pushEvent('OnReceiveNotification', {
                notification: {
                    title: remoteMessage.notification?.title,
                    body: remoteMessage.notification?.body,
                    data: remoteMessage.data,
                },
            });
        });

        // 앱 백그라운드 상태에서 알림 클릭
        const unsubscribeOnOpened = provider.notificationService.onNotificationOpenedApp(remoteMessage => {
            bridge.pushEvent('OnOpenNotification', (remoteMessage.data || {}) as any);
        });

        // 앱 종료 상태에서 알림 클릭 (Cold Start)
        provider.notificationService.getInitialNotification().then(remoteMessage => {
            if (remoteMessage) {
                /**
                 * TODO: Handle initial notification when webview is ready
                 * @author dev@example.com
                 */
                setTimeout(() => {
                    bridge.pushEvent('OnOpenNotification', {
                        notification: remoteMessage.data || {},
                    } as any);
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
