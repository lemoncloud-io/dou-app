import { useMemo } from 'react';

import { runtime } from '@chatic/runtime';

import { useNotificationStore } from '../stores/useNotificationStore';
import { inScope, type NotificationItem } from '../utils/notifications';
import { toCloudId } from './useCloudScope';

export const useScopedNotifications = (): NotificationItem[] => {
    const { selectedCloudId, selectedSiteId } = runtime.session.useSessionSelection();
    const items = useNotificationStore(state => state.items);
    return useMemo(
        () => inScope(Object.values(items), toCloudId(selectedCloudId), selectedSiteId),
        [items, selectedCloudId, selectedSiteId]
    );
};
