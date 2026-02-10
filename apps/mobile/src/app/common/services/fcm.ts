import { PermissionsAndroid, Platform } from 'react-native';

import messaging, { AuthorizationStatus } from '@react-native-firebase/messaging';

import { Logger } from './log';

import type { RemoteMessage } from '@react-native-firebase/messaging';

export const FcmService = {
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

    getToken: async (): Promise<string | null> => {
        try {
            return await messaging().getToken();
        } catch (e) {
            Logger.error('FCM', 'Get token error.', e);
            return null;
        }
    },

    getInitialNotification: async (): Promise<RemoteMessage | null> => {
        return messaging().getInitialNotification();
    },

    onMessage: (callback: (message: any) => void): (() => void) => {
        return messaging().onMessage(callback);
    },

    onNotificationOpenedApp: (callback: (message: any) => void) => {
        return messaging().onNotificationOpenedApp(callback);
    },
};
