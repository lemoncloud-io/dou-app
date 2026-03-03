import { useCallback, useEffect } from 'react';
import { Platform } from 'react-native';

import { FcmService, Logger } from '../../services';

import type { WebViewBridge } from './useBaseBridge';
import type { AppMessageData } from '@chatic/app-messages';

/**
 * 웹뷰에서 FCM 기능을 사용하기 위한 핸들러 훅
 * @param bridge
 */
export const useFcmHandler = (bridge: WebViewBridge) => {
    const getFcmToken = useCallback(async () => {
        try {
            const hasPermission = await FcmService.requestPermission();

            if (hasPermission) {
                // iOS의 경우 APNs 토큰 생성을 위해 명시적으로 기기 등록을 수행
                if (Platform.OS === 'ios') {
                    await FcmService.registerAPNs();
                }

                const token = await FcmService.getToken();

                if (token) {
                    const message: AppMessageData<'OnUpdateFcmToken'> = {
                        type: 'OnUpdateFcmToken',
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
            const message: AppMessageData<'OnReceiveNotification'> = {
                type: 'OnReceiveNotification',
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
            const message: AppMessageData<'OnOpenNotification'> = {
                type: 'OnOpenNotification',
                data: remoteMessage.data || {},
            };
            bridge.post(message);
        });

        // 앱 종료 상태에서 알림 클릭 (Cold Start)
        FcmService.getInitialNotification().then(remoteMessage => {
            if (remoteMessage) {
                /**
                 * TODO: Handle initial notification when webview is ready
                 * @author dev@example.com
                 */
                setTimeout(() => {
                    const message: AppMessageData<'OnOpenNotification'> = {
                        type: 'OnOpenNotification',
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

    return { getFcmToken };
};
