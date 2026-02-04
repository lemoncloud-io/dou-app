import { useCallback, useEffect } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';

import { AuthorizationStatus, getMessaging } from '@react-native-firebase/messaging';

import type { WebViewBridge } from '../index';
import type { AppErrorInfo, AppLogInfo, AppMessageData } from '@chatic/app-messages';

interface FcmHandlerProps {
    bridge: WebViewBridge;
    sendAppLog: (log: AppLogInfo) => void;
    sendAppError: (error: AppErrorInfo) => void;
}

export const useFcmHandler = ({ bridge, sendAppLog, sendAppError }: FcmHandlerProps) => {
    const setFcmToken = useCallback(async () => {
        try {
            if (Platform.OS === 'android' && Platform.Version >= 33) {
                const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
                if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
                    sendAppError({
                        tag: 'FCM',
                        message: 'Android 알림 권한이 거부되었습니다.',
                    });
                    return;
                }
            }

            const messaging = getMessaging();
            const authStatus = await messaging.requestPermission();
            const enabled =
                authStatus === AuthorizationStatus.AUTHORIZED || authStatus === AuthorizationStatus.PROVISIONAL;

            if (enabled) {
                const token = await messaging.getToken();
                const message: AppMessageData<'SetFcmToken'> = {
                    type: 'SetFcmToken',
                    data: { token },
                };
                bridge.post(message);
                sendAppLog({ tag: 'FCM', message: '토큰 발급 완료', level: 'info' });
            } else {
                sendAppError({ tag: 'FCM', message: '알림 권한이 허용되지 않았습니다.' });
            }
        } catch (e: any) {
            sendAppError({ tag: 'FCM', message: '토큰 발급 중 오류 발생', details: e });
        }
    }, [bridge, sendAppLog, sendAppError]);

    useEffect(() => {
        const messaging = getMessaging();

        // 포그라운드 알림 수신
        const unsubscribeOnMessage = messaging.onMessage(async remoteMessage => {
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

        // 백그라운드 상태에서 알림 클릭
        const unsubscribeOnOpened = messaging.onNotificationOpenedApp(remoteMessage => {
            const message: AppMessageData<'NotificationOpened'> = {
                type: 'NotificationOpened',
                data: remoteMessage.data || {},
            };
            bridge.post(message);
        });

        // 앱 종료 상태에서 알림 클릭 (Cold Start)
        messaging.getInitialNotification().then(remoteMessage => {
            if (remoteMessage) {
                /**
                 * TODO: Handle initial notification when webview is ready
                 * @author dev@example.com
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
    }, [bridge, sendAppLog]);

    return { setFcmToken };
};
