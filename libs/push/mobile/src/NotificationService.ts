import { PermissionsAndroid, Platform } from 'react-native';
import type { FirebaseMessagingTypes } from '@react-native-firebase/messaging';
import messaging, { AuthorizationStatus } from '@react-native-firebase/messaging';
import notifee, { AndroidImportance } from '@notifee/react-native';
import PushNotificationIOS from '@react-native-community/push-notification-ios';
import type { Logger } from '@chatic/logger';

import type { INotificationService, NotificationServiceOptions, PushCopyLocalizer } from './types';

const asString = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);

export const foregroundAPNsCopy = (
    data: Record<string, unknown>,
    alertTitle: string | undefined,
    alertBody: string | undefined,
    localize: PushCopyLocalizer
): { title: string | undefined; body: string | undefined } => {
    if (data.silent === true || data.silent === 'true') return { title: alertTitle, body: alertBody };
    const titleKey = asString(data.title_loc_key) ?? asString(data.titleLocKey);
    const bodyKey = asString(data.loc_key) ?? asString(data.bodyLocKey);
    const titleArgs = data.title_loc_args ?? data.titleLocArgs;
    const bodyArgs = data.loc_args ?? data.bodyLocArgs;
    return {
        title: (titleKey && localize(titleKey, titleArgs, 'title')) || alertTitle,
        body: (bodyKey && localize(bodyKey, bodyArgs, 'body')) || alertBody,
    };
};

export class NotificationService implements INotificationService {
    private readonly beforePrompt: () => Promise<void>;

    constructor(
        private readonly logger: Logger,
        private readonly options: NotificationServiceOptions
    ) {
        this.beforePrompt = options.beforePrompt ?? (() => Promise.resolve());
    }

    async hasPermission(): Promise<FirebaseMessagingTypes.AuthorizationStatus> {
        return messaging().hasPermission();
    }

    async createNotificationChannel() {
        try {
            await notifee.createChannel({
                id: 'dou_chat',
                name: this.options.copy.channelName('chat'),
                importance: AndroidImportance.HIGH,
                sound: 'default',
            });
            await notifee.createChannel({
                id: 'dou_chat_muted',
                name: this.options.copy.channelName('chat'),
                importance: AndroidImportance.LOW,
            });

            await notifee.createChannel({
                id: 'dou_notice',
                name: this.options.copy.channelName('notice'),
                importance: AndroidImportance.DEFAULT,
            });

            await notifee.createChannel({
                id: 'dou_marketing',
                name: this.options.copy.channelName('marketing'),
                importance: AndroidImportance.LOW,
            });

            await notifee.createChannel({
                id: 'dou_cloud',
                name: this.options.copy.channelName('cloud'),
                importance: AndroidImportance.HIGH,
            });
        } catch (e) {
            this.logger.error('NOTIFICATION', 'Create channel error.', e);
        }
    }

    async requestPermission(): Promise<boolean> {
        if (await this.wouldPrompt()) await this.beforePrompt();

        if (Platform.OS === 'android' && Platform.Version >= 33) {
            const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
            if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
                return false;
            }
        }

        const authStatus = await messaging().requestPermission();
        return authStatus === AuthorizationStatus.AUTHORIZED || authStatus === AuthorizationStatus.PROVISIONAL;
    }

    private async wouldPrompt(): Promise<boolean> {
        try {
            if (Platform.OS === 'android') {
                if (Platform.Version < 33) return false;
                return !(await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS));
            }
            return (await messaging().hasPermission()) === AuthorizationStatus.NOT_DETERMINED;
        } catch {
            return true;
        }
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

    async getInitialNotification(): Promise<FirebaseMessagingTypes.RemoteMessage | null> {
        this.clearBadge();

        try {
            if (Platform.OS === 'ios') {
                const apnsInitial = await PushNotificationIOS.getInitialNotification();
                if (apnsInitial) {
                    return {
                        notification: {
                            title: apnsInitial.getTitle(),
                            body: apnsInitial.getMessage(),
                        },
                        data: apnsInitial.getData() as Record<string, string>,
                        sentTime: Date.now(),
                    } as FirebaseMessagingTypes.RemoteMessage;
                }
            }

            return await messaging().getInitialNotification();
        } catch (e) {
            this.logger.error('NOTIFICATION', 'Get initial notification error.', e);
            return null;
        }
    }

    onMessage(callback: (message: FirebaseMessagingTypes.RemoteMessage) => void): () => void {
        this.clearBadge();

        const unsubscribeFCM = messaging().onMessage(callback);

        if (Platform.OS === 'ios') {
            const handleAPNs = (notification: any) => {
                const data = (notification.getData() ?? {}) as Record<string, unknown>;
                const normalizedMessage = {
                    notification: foregroundAPNsCopy(
                        data,
                        notification.getTitle(),
                        notification.getMessage(),
                        this.options.copy.localize
                    ),
                    data: data as Record<string, string>,
                    sentTime: Date.now(),
                } as FirebaseMessagingTypes.RemoteMessage;

                callback(normalizedMessage);

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

    onNotificationOpenedApp(callback: (message: FirebaseMessagingTypes.RemoteMessage) => void): () => void {
        this.clearBadge();

        const unsubscribeFCM = messaging().onNotificationOpenedApp(callback);

        if (Platform.OS === 'ios') {
            const handleTap = (notification: any) => {
                const normalizedMessage = {
                    notification: {
                        title: notification.getTitle(),
                        body: notification.getMessage(),
                    },
                    data: notification.getData() as Record<string, string>,
                    sentTime: Date.now(),
                } as FirebaseMessagingTypes.RemoteMessage;

                callback(normalizedMessage);
            };

            PushNotificationIOS.addEventListener('localNotification', handleTap);

            return () => {
                unsubscribeFCM();
                PushNotificationIOS.removeEventListener('localNotification');
            };
        }

        return unsubscribeFCM;
    }

    onTokenRefresh(callback: (token: string) => void): () => void {
        return messaging().onTokenRefresh(callback);
    }

    async setBadgeCount(count: number): Promise<void> {
        try {
            await notifee.setBadgeCount(count);
            await this.options.badgeMirror.setBase(count);
        } catch (e) {
            this.logger.error('NOTIFICATION', 'Set badge error.', e);
        }
    }

    async clearBadge(): Promise<void> {
        try {
            await notifee.setBadgeCount(0);
            await this.options.badgeMirror.setBase(0);
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
