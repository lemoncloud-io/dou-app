import { PermissionsAndroid, Platform } from 'react-native';

import type { FirebaseMessagingTypes } from '@react-native-firebase/messaging';
import messaging, { AuthorizationStatus } from '@react-native-firebase/messaging';
import notifee from '@notifee/react-native';
import { logger } from './log';

export const notificationService = {
    hasPermission: async (): Promise<FirebaseMessagingTypes.AuthorizationStatus> => {
        return messaging().hasPermission();
    },

    requestPermission: async (): Promise<boolean> => {
        if (Platform.OS === 'android' && Platform.Version >= 33) {
            const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
            if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
                return false;
            }
        }

        const authStatus = await messaging().requestPermission();
        return authStatus === AuthorizationStatus.AUTHORIZED || authStatus === AuthorizationStatus.PROVISIONAL;
    },

    getAPNSToken: async () => {
        if (Platform.OS === 'ios') {
            return await messaging().getAPNSToken();
        }
        return null;
    },

    getToken: async (): Promise<string | null> => {
        try {
            return await messaging().getToken();
        } catch (e) {
            logger.error('NOTIFICATION', 'Get token error.', e);
            return null;
        }
    },

    deleteToken: async (): Promise<void> => {
        try {
            await messaging().deleteToken();
        } catch (e) {
            logger.error('NOTIFICATION', 'Delete token error.', e);
        }
    },

    registerAPNs: async () => {
        try {
            await messaging().registerDeviceForRemoteMessages();
        } catch (e) {
            logger.error('NOTIFICATION', 'Register APNs error.', e);
        }
    },

    getInitialNotification: async (): Promise<FirebaseMessagingTypes.RemoteMessage | null> => {
        notificationService.clearBadge();
        return messaging().getInitialNotification();
    },

    onMessage: (callback: (message: any) => void): (() => void) => {
        notificationService.clearBadge();
        return messaging().onMessage(callback);
    },

    onNotificationOpenedApp: (callback: (message: any) => void) => {
        notificationService.clearBadge();
        return messaging().onNotificationOpenedApp(callback);
    },

    onTokenRefresh: (callback: (token: string) => void) => {
        return messaging().onTokenRefresh(callback);
    },

    setBadgeCount: async (count: number): Promise<void> => {
        try {
            if (Platform.OS === 'ios') {
                await notifee.setBadgeCount(count);
            } else {
                await notifee.setBadgeCount(count);
            }
        } catch (e) {
            logger.error('NOTIFICATION', 'Set badge error.', e);
        }
    },

    clearBadge: async (): Promise<void> => {
        try {
            await notifee.setBadgeCount(0);
        } catch (e) {
            logger.error('NOTIFICATION', 'Clear badge error.', e);
        }
    },

    getBadgeCount: async (): Promise<number> => {
        try {
            return await notifee.getBadgeCount();
        } catch (e) {
            logger.error('NOTIFICATION', 'Get badge error.', e);
            return 0;
        }
    },
};
