import { PermissionsAndroid, Platform } from 'react-native';
import type { FirebaseMessagingTypes } from '@react-native-firebase/messaging';
import messaging, { AuthorizationStatus } from '@react-native-firebase/messaging';
import notifee, { AndroidImportance } from '@notifee/react-native';
import PushNotificationIOS from '@react-native-community/push-notification-ios';
import type { INotificationService } from './types';
import type { ILogService } from '../log';

export class NotificationService implements INotificationService {
    constructor(private readonly logger: ILogService) {}

    async hasPermission(): Promise<FirebaseMessagingTypes.AuthorizationStatus> {
        return messaging().hasPermission();
    }

    async createNotificationChannel() {
        await notifee.createChannel({
            id: 'dou_chat',
            name: '새 메시지',
            importance: AndroidImportance.HIGH,
            sound: 'default',
        });
        await notifee.createChannel({
            id: 'dou_chat_muted',
            name: '새 메시지',
            importance: AndroidImportance.LOW,
        });

        await notifee.createChannel({
            id: 'dou_notice',
            name: '서비스 공지사항',
            importance: AndroidImportance.DEFAULT,
        });

        await notifee.createChannel({
            id: 'dou_marketing',
            name: '이벤트 및 혜택',
            importance: AndroidImportance.LOW,
        });

        await notifee.createChannel({
            id: 'dou_cloud',
            name: '클라우드',
            importance: AndroidImportance.HIGH,
        });
    }

    async requestPermission(): Promise<boolean> {
        if (Platform.OS === 'android' && Platform.Version >= 33) {
            const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
            if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
                return false;
            }
        }

        const authStatus = await messaging().requestPermission();
        return authStatus === AuthorizationStatus.AUTHORIZED || authStatus === AuthorizationStatus.PROVISIONAL;
    }

    async getAPNSToken(): Promise<string | null> {
        if (Platform.OS === 'ios') {
            return await messaging().getAPNSToken();
        }
        return null;
    }

    async getToken(): Promise<string | null> {
        try {
            return await messaging().getToken();
        } catch (e) {
            this.logger.error('NOTIFICATION', 'Get token error.', e);
            return null;
        }
    }

    async deleteToken(): Promise<void> {
        try {
            await messaging().deleteToken();
        } catch (e) {
            this.logger.error('NOTIFICATION', 'Delete token error.', e);
        }
    }

    async registerAPNs(): Promise<void> {
        try {
            await messaging().registerDeviceForRemoteMessages();
        } catch (e) {
            this.logger.error('NOTIFICATION', 'Register APNs error.', e);
        }
    }

    async getInitialNotification(): Promise<any> {
        this.clearBadge();

        if (Platform.OS === 'ios') {
            const apnsInitial = await PushNotificationIOS.getInitialNotification();
            if (apnsInitial) {
                // APNs 초기 알림 포맷팅
                return {
                    notification: {
                        title: apnsInitial.getTitle(),
                        body: apnsInitial.getMessage(),
                    },
                    data: apnsInitial.getData(),
                    isAPNs: true,
                };
            }
        }

        return messaging().getInitialNotification();
    }

    onMessage(callback: (message: any) => void): () => void {
        this.clearBadge();

        // FCM 리스너 등록
        const unsubscribeFCM = messaging().onMessage(callback);

        // iOS APNs 리스너 등록
        if (Platform.OS === 'ios') {
            const handleAPNs = (notification: any) => {
                const normalizedMessage = {
                    notification: {
                        title: notification.getTitle(),
                        body: notification.getMessage(),
                    },
                    data: notification.getData(),
                    isAPNs: true, // 로그 식별용
                };

                callback(normalizedMessage);

                // OS에 알림 처리 완료를 보고
                notification.finish(PushNotificationIOS.FetchResult.NoData);
            };

            PushNotificationIOS.addEventListener('notification', handleAPNs);

            return () => {
                unsubscribeFCM();
                PushNotificationIOS.removeEventListener('notification');
            };
        }

        return unsubscribeFCM;
    }

    onNotificationOpenedApp(callback: (message: any) => void): () => void {
        this.clearBadge();
        return messaging().onNotificationOpenedApp(callback);
    }

    onTokenRefresh(callback: (token: string) => void): () => void {
        return messaging().onTokenRefresh(callback);
    }

    async setBadgeCount(count: number): Promise<void> {
        try {
            await notifee.setBadgeCount(count);
        } catch (e) {
            this.logger.error('NOTIFICATION', 'Set badge error.', e);
        }
    }

    async clearBadge(): Promise<void> {
        try {
            await notifee.setBadgeCount(0);
        } catch (e) {
            this.logger.error('NOTIFICATION', 'Clear badge error.', e);
        }
    }

    async getBadgeCount(): Promise<number> {
        try {
            return await notifee.getBadgeCount();
        } catch (e) {
            this.logger.error('NOTIFICATION', 'Get badge error.', e);
            return 0;
        }
    }
}
