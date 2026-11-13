import { useNotificationCapture, useNotificationReadSync } from './hooks';

/**
 * The notification inbox's background half, mounted once under `AppRuntime` (inside the shared
 * active-cloud observation), so the inbox fills and clears on every route — not only while a screen
 * that shows it is open.
 */
export const NotificationsRunner = (): null => {
    useNotificationCapture();
    useNotificationReadSync();
    return null;
};
