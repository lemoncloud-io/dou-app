import type { FirebaseMessagingTypes } from '@react-native-firebase/messaging';

/**
 * INotificationService
 *
 * A native notification service that integrates closely with the OS (FCM/APNs) at the lowest
 * level to handle push reception, permission management, and badge control.
 */
export interface INotificationService {
    /**
     * Fetches the notification permission status.
     * @returns the Firebase messaging AuthorizationStatus for whether permission was granted
     */
    hasPermission(): Promise<FirebaseMessagingTypes.AuthorizationStatus>;

    /**
     * Dynamically creates the Android notification channels and refreshes their translated names.
     * Implemented so the device's OS settings screen reflects the translated names immediately.
     */
    createNotificationChannel(): Promise<void>;

    /**
     * Requests system notification permission.
     * @returns whether permission was granted
     */
    requestPermission(): Promise<boolean>;

    /**
     * Fetches the iOS-only APNs token.
     * @returns the APNs token string, or null
     */
    getAPNSToken(): Promise<string | null>;

    /**
     * Fetches the device's FCM registration token.
     * @returns the FCM device token string, or null
     */
    getToken(): Promise<string | null>;

    /**
     * Forcibly expires and deletes the current device's FCM registration token.
     */
    deleteToken(): Promise<void>;

    /**
     * Performs the APNs registration procedure for receiving background messages on iOS.
     */
    registerAPNs(): Promise<void>;

    /**
     * Fetches the initial notification payload that arrived when the app was first launched (cold
     * start) via a notification tap.
     * @returns the RemoteMessage payload that caused the initial launch, or null
     */
    getInitialNotification(): Promise<FirebaseMessagingTypes.RemoteMessage | null>;

    /**
     * Registers a listener to detect notification events arriving in real time while the app is in
     * the foreground (running).
     * @param callback the handler to call when a notification is received
     * @returns an unsubscribe function to remove the listener
     */
    onMessage(callback: (message: FirebaseMessagingTypes.RemoteMessage) => void): () => void;

    /**
     * Registers a listener for when the user activates the app by tapping a system notification
     * banner while it's in the background.
     * @param callback the handler to call on the notification tap
     * @returns an unsubscribe function to remove the listener
     */
    onNotificationOpenedApp(callback: (message: FirebaseMessagingTypes.RemoteMessage) => void): () => void;

    /**
     * Detects the event fired when the FCM token is automatically refreshed in the background.
     * @param callback the handler that receives the refreshed token string
     * @returns an unsubscribe function to remove the listener
     */
    onTokenRefresh(callback: (token: string) => void): () => void;

    /**
     * Sets the app icon's native badge count value.
     * @param count the number to set on the badge
     */
    setBadgeCount(count: number): Promise<void>;

    /**
     * Immediately resets the app icon's native badge count value to 0.
     */
    clearBadge(): Promise<void>;

    /**
     * Fetches the native badge count currently applied to the app icon.
     * @returns the current badge count number
     */
    getBadgeCount(): Promise<number>;
}

/**
 * IPushEventManager
 *
 * An event broker that lowers the coupling between the lowest-level native notification channel
 * and the hybrid WebView bridge (`useFcmHandler`), and safely propagates foreground push events
 * to multiple observers.
 */
export interface IPushEventManager {
    /**
     * Adds a listener to be notified of real-time push messages received in the foreground.
     * @param callback the callback that handles the notification message
     * @returns an unsubscribe function to remove the listener
     */
    onReceiveNotification(callback: (message: FirebaseMessagingTypes.RemoteMessage) => void): () => void;

    /**
     * Multicasts a detected foreground push message to every registered bridge listener.
     * @param message the original RemoteMessage to propagate
     */
    emitReceiveNotification(message: FirebaseMessagingTypes.RemoteMessage): void;
}
