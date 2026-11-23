import type { INotificationService } from './types';

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
