import { PermissionsAndroid, Platform } from 'react-native';
import type { FirebaseMessagingTypes } from '@react-native-firebase/messaging';
import messaging, { AuthorizationStatus } from '@react-native-firebase/messaging';
import notifee, { AndroidImportance } from '@notifee/react-native';
import PushNotificationIOS from '@react-native-community/push-notification-ios';
import type { INotificationService } from './types';
import type { ILogService } from '../log';
import { BadgeSyncBridge } from '../../bridge';
import { t } from '../../utils';

/**
 * NotificationService
 *
 * The core native communication module that precisely controls Android's (FCM/Notifee) and iOS's
 * (FCM/APNs/PushNotificationIOS) native push channels, permissions, and the app badge count.
 */
export class NotificationService implements INotificationService {
    constructor(private readonly logger: ILogService) {}

    /**
     * Fetches the notification permission status.
     * @returns the permission status
     */
    async hasPermission(): Promise<FirebaseMessagingTypes.AuthorizationStatus> {
        return messaging().hasPermission();
    }

    /**
     * Creates the notification channels shown in the Android OS settings screen and refreshes their
     * translated names to match the device's language setting.
     * - `dou_chat`: new chat messages (high importance, sound on)
     * - `dou_chat_muted`: muted chat messages (low importance, silent)
     * - `dou_notice`: service notices (default importance)
     * - `dou_marketing`: perks and events (low importance)
     * - `dou_cloud`: cloud file sync (high importance)
     */
    async createNotificationChannel() {
        await notifee.createChannel({
            id: 'dou_chat',
            name: t('notification.channel.chat'),
            importance: AndroidImportance.HIGH,
            sound: 'default',
        });
        await notifee.createChannel({
            id: 'dou_chat_muted',
            name: t('notification.channel.chat'),
            importance: AndroidImportance.LOW,
        });

        await notifee.createChannel({
            id: 'dou_notice',
            name: t('notification.channel.notice'),
            importance: AndroidImportance.DEFAULT,
        });

        await notifee.createChannel({
            id: 'dou_marketing',
            name: t('notification.channel.marketing'),
            importance: AndroidImportance.LOW,
        });

        await notifee.createChannel({
            id: 'dou_cloud',
            name: t('notification.channel.cloud'),
            importance: AndroidImportance.HIGH,
        });
    }

    /**
     * Consistently requests Android 13+ (API 33+) notification permission and iOS push permission,
     * per platform.
     * @returns whether permission was granted
     */
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

    /**
     * Fetches the iOS-only APNs token. (Required for FCM integration.)
     * @returns the APNs token, or null
     */
    async getAPNSToken(): Promise<string | null> {
        if (Platform.OS === 'ios') {
            return await messaging().getAPNSToken();
        }
        return null;
    }

    /**
     * Fetches the device's unique FCM registration token.
     * @returns the FCM registration token, or null
     */
    async getToken(): Promise<string | null> {
        try {
            return await messaging().getToken();
        } catch (e) {
            this.logger.error('NOTIFICATION', 'Get token error.', e);
            return null;
        }
    }

    /**
     * Expires and releases the current device's FCM token. (Recommended on logout.)
     */
    async deleteToken(): Promise<void> {
        try {
            await messaging().deleteToken();
        } catch (e) {
            this.logger.error('NOTIFICATION', 'Delete token error.', e);
        }
    }

    /**
     * Registers and activates the APNs background handler for detecting background pushes on iOS.
     */
    async registerAPNs(): Promise<void> {
        try {
            await messaging().registerDeviceForRemoteMessages();
        } catch (e) {
            this.logger.error('NOTIFICATION', 'Register APNs error.', e);
        }
    }

    /**
     * Intercepts and normalizes the payload that triggered the app's first launch when a system
     * notification banner is tapped while the app was fully killed.
     * The icon badge is cleared automatically on entry.
     * @returns the normalized RemoteMessage, or null
     */
    async getInitialNotification(): Promise<FirebaseMessagingTypes.RemoteMessage | null> {
        this.clearBadge();

        if (Platform.OS === 'ios') {
            const apnsInitial = await PushNotificationIOS.getInitialNotification();
            if (apnsInitial) {
                // Normalize-map the APNs notification object into the standard FCM RemoteMessage shape
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

        return messaging().getInitialNotification();
    }

    /**
     * Binds real-time notification events arriving while the app is in the foreground from the OS
     * and forwards them to the observer handler.
     * Normalizes both iOS APNs detection and Android FCM detection into a single entry callback format.
     * @param callback the callback to run when a notification is received
     * @returns an unsubscribe function to break the callback binding
     */
    onMessage(callback: (message: FirebaseMessagingTypes.RemoteMessage) => void): () => void {
        this.clearBadge();

        // 1. Register the Android FCM receive listener
        const unsubscribeFCM = messaging().onMessage(callback);

        // 2. Register and normalize the iOS APNs receive listener
        if (Platform.OS === 'ios') {
            const handleAPNs = (notification: any) => {
                const normalizedMessage = {
                    notification: {
                        title: notification.getTitle(),
                        body: notification.getMessage(),
                    },
                    data: notification.getData() as Record<string, string>,
                    sentTime: Date.now(),
                } as FirebaseMessagingTypes.RemoteMessage;

                callback(normalizedMessage);

                // Must report completion of iOS background data reception
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

    /**
     * Registers a callback for when the user enters the app by tapping a banner notification while
     * it's active in the background.
     * @param callback the callback handler for the tap event
     * @returns an unsubscribe function
     */
    onNotificationOpenedApp(callback: (message: FirebaseMessagingTypes.RemoteMessage) => void): () => void {
        this.clearBadge();

        // Android/FCM: taps arrive through FCM's own handler.
        const unsubscribeFCM = messaging().onNotificationOpenedApp(callback);

        // iOS: a banner tap is delivered by the OS as a UNNotificationResponse, which the native
        // AppDelegate forwards via RNCPushNotificationIOS.didReceive(response). On the JS side that
        // surfaces as the `localNotification` event — NOT the `notification` event and NOT FCM's
        // onNotificationOpenedApp (FCM never sees the tap here). Without this branch iOS taps are lost.
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

    /**
     * A callback function registered for when the FCM token is refreshed in the background on its
     * own, e.g. due to a network state change.
     * @param callback the callback that receives the refreshed token
     * @returns an unsubscribe function
     */
    onTokenRefresh(callback: (token: string) => void): () => void {
        return messaging().onTokenRefresh(callback);
    }

    /**
     * Draws a given badge count number on the home screen app launcher icon. (Using Notifee.)
     * @param count the number to display
     */
    async setBadgeCount(count: number): Promise<void> {
        try {
            await notifee.setBadgeCount(count);
            // Mirror the authoritative total into native storage so a background push (handled while
            // the socket/web is suspended) can increment from the truth. No-op on iOS — see BadgeSyncBridge.
            await BadgeSyncBridge.setBase(count);
        } catch (e) {
            this.logger.error('NOTIFICATION', 'Set badge error.', e);
        }
    }

    /**
     * Immediately clears (sets to 0) the home screen app launcher icon badge.
     */
    async clearBadge(): Promise<void> {
        try {
            await notifee.setBadgeCount(0);
            // Keep the native base in sync so a subsequent background push starts counting from 0.
            await BadgeSyncBridge.setBase(0);
        } catch (e) {
            this.logger.error('NOTIFICATION', 'Clear badge error.', e);
        }
    }

    /**
     * Fetches the native badge count value currently shown on the app icon.
     * @returns the current badge number
     */
    async getBadgeCount(): Promise<number> {
        try {
            return await notifee.getBadgeCount();
        } catch (e) {
            this.logger.error('NOTIFICATION', 'Get badge error.', e);
            return 0;
        }
    }
}
