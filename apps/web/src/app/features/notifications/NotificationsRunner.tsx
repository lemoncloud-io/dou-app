import { useEffect } from 'react';

import { removeRetiredNotificationStorage } from '../../stores/useNotificationStore';
import { useNotificationFeed } from './hooks';

/**
 * The notification inbox's background half, mounted once under `AppRuntime` (inside the shared
 * active-cloud observation), so the inbox follows the cache on every route — not only while a screen
 * that shows it is open.
 */
export const NotificationsRunner = (): null => {
    useEffect(() => removeRetiredNotificationStorage(), []);
    useNotificationFeed();
    return null;
};
