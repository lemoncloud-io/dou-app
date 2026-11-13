import { useMemo } from 'react';

import { runtime } from '@chatic/app-runtime';

import { useNotificationStore } from '../stores/useNotificationStore';
import { inScope, type NotificationItem } from '../utils/notifications';
import { toCloudId } from './useCloudScope';

/**
 * The notification inbox's items for where the session is — the selected cloud and place — the
 * scope every inbox surface reads: the notifications tab, the bottom-nav dot, home's find-me entry.
 * Other places' news is on home's place chips, not here.
 */
export const useScopedNotifications = (): NotificationItem[] => {
    const { selectedCloudId, selectedSiteId } = runtime.session.useSessionSelection();
    const items = useNotificationStore(state => state.items);
    return useMemo(
        () => inScope(Object.values(items), toCloudId(selectedCloudId), selectedSiteId),
        [items, selectedCloudId, selectedSiteId]
    );
};
