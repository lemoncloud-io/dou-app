import { AppRegistry } from 'react-native';
import messaging from '@react-native-firebase/messaging';
import { App } from './app/App';
import { notificationService, offlinePushQueue } from './app/services';
import { withTimeout } from './app/utils';

messaging().setBackgroundMessageHandler(async remoteMessage => {
    console.log('[BackgroundHandler] Received background message ID:', remoteMessage.messageId);

    if (!remoteMessage.data) {
        console.log('[BackgroundHandler] Background message has no data payload. Skipping.');
        return;
    }

    const rawBadge = remoteMessage.data.badge;
    if (rawBadge !== undefined && rawBadge !== null) {
        const badgeCount = parseInt(String(rawBadge), 10);
        if (!isNaN(badgeCount)) {
            try {
                await notificationService.setBadgeCount(badgeCount);
                console.log('[BackgroundHandler] Successfully set native badge count in background to:', badgeCount);
            } catch (badgeError) {
                console.error('[BackgroundHandler] Failed to set native badge count in background:', badgeError);
            }
        }
    }

    try {
        // Enqueue the raw push payload into the MMKV OfflinePushQueue within 25s
        await withTimeout(offlinePushQueue.enqueue(remoteMessage.data), 25000, 'Background task timed out at 25s');
        console.log('[BackgroundHandler] Push payload successfully enqueued to offline queue.');
    } catch (error) {
        console.error('[BackgroundHandler] Background queue enqueue failed or timed out:', error);
    }
});

AppRegistry.registerComponent('Chatic', () => App);
