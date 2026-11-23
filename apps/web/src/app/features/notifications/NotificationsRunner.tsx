import { useEffect } from 'react';

import { removeRetiredNotificationStorage } from '../../stores/useNotificationStore';
import { useNotificationFeed } from './hooks';

export const NotificationsRunner = (): null => {
    useEffect(() => removeRetiredNotificationStorage(), []);
    useNotificationFeed();
    return null;
};
