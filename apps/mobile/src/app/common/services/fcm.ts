import { PermissionsAndroid, Platform } from 'react-native';

import messaging, { AuthorizationStatus } from '@react-native-firebase/messaging';

import { Logger } from './log';

export const FcmService = {
    requestPermission: async (): Promise<boolean> => {
        try {
            if (Platform.OS === 'android' && Platform.Version >= 33) {
                const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
                if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
                    return false;
                }
            }

            const authStatus = await messaging().requestPermission();
            return authStatus === AuthorizationStatus.AUTHORIZED || authStatus === AuthorizationStatus.PROVISIONAL;
        } catch (e) {
            Logger.error('FCM', 'Request permission error.', e);
            throw e;
        }
    },

    getToken: async (): Promise<string | null> => {
        try {
            return await messaging().getToken();
        } catch (e) {
            Logger.error('FCM', 'Get token error.', e);
            return null;
        }
    },

    getInitialNotification: async () => {
        return messaging().getInitialNotification();
    },

    onMessage: (callback: (message: any) => void) => {
        return messaging().onMessage(callback);
    },

    onNotificationOpenedApp: (callback: (message: any) => void) => {
        return messaging().onNotificationOpenedApp(callback);
    },
};
