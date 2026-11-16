import type { INotificationService } from './types';

/**
 * The push token this device registers, as the push broker expects it per platform: the APNs device
 * token on iOS (the broker delivers through APNs there), the FCM registration token elsewhere. Asks for
 * notification permission first — on iOS that is also what lets the app register with APNs.
 *
 * One function for both callers: the page asks for it over the bridge (`FetchFcmToken`), and the app's
 * own runtime asks for it when it holds the session. Rejects when permission is denied or no token
 * came back; the caller decides whether that is an answer to send or a registration to skip.
 */
export const acquirePushToken = async (
    notifications: Pick<INotificationService, 'requestPermission' | 'registerAPNs' | 'getAPNSToken' | 'getToken'>,
    os: string
): Promise<string> => {
    if (!(await notifications.requestPermission())) throw new Error('Notification permission denied.');
    let token: string | null;
    if (os === 'ios') {
        await notifications.registerAPNs();
        token = await notifications.getAPNSToken();
    } else {
        token = await notifications.getToken();
    }
    if (!token) throw new Error('Failed to generate FCM Token');
    return token;
};
