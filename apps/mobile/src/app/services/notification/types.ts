import type { FirebaseMessagingTypes } from '@react-native-firebase/messaging';

export interface INotificationService {
    hasPermission(): Promise<FirebaseMessagingTypes.AuthorizationStatus>;
    createNotificationChannel(): Promise<void>;
    requestPermission(): Promise<boolean>;
    getAPNSToken(): Promise<string | null>;
    getToken(): Promise<string | null>;
    deleteToken(): Promise<void>;
    registerAPNs(): Promise<void>;
    getInitialNotification(): Promise<any>;
    onMessage(callback: (message: any) => void): () => void;
    onNotificationOpenedApp(callback: (message: any) => void): () => void;
    onTokenRefresh(callback: (token: string) => void): () => void;
    setBadgeCount(count: number): Promise<void>;
    clearBadge(): Promise<void>;
    getBadgeCount(): Promise<number>;
}
