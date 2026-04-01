import { PermissionsAndroid, Platform } from 'react-native';

import type { FirebaseMessagingTypes } from '@react-native-firebase/messaging';
import messaging, { AuthorizationStatus } from '@react-native-firebase/messaging';
import { logger } from './log';

export const fcmService = {
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
            logger.error('FCM', 'Get token error.', e);
            return null;
        }
    },

    deleteToken: async (): Promise<void> => {
        try {
            await messaging().deleteToken();
        } catch (e) {
            logger.error('FCM', 'Delete token error.', e);
        }
    },

    registerAPNs: async () => {
        try {
            await messaging().registerDeviceForRemoteMessages();
        } catch (e) {
            logger.error('FCM', 'Register APNs error.', e);
        }
    },

    getInitialNotification: async (): Promise<FirebaseMessagingTypes.RemoteMessage | null> => {
        return messaging().getInitialNotification();
    },

    onMessage: (callback: (message: any) => void): (() => void) => {
        return messaging().onMessage(callback);
    },

    onNotificationOpenedApp: (callback: (message: any) => void) => {
        return messaging().onNotificationOpenedApp(callback);
    },

    onTokenRefresh: (callback: (token: string) => void) => {
        return messaging().onTokenRefresh(callback);
    },
};
