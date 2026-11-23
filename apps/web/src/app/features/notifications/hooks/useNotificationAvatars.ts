import { useCallback, useMemo } from 'react';

import { useSenderProfiles, type SenderProfileRef } from '../../../hooks/useSenderProfiles';
import type { NotificationItem } from '../../../utils/notifications';

export const useNotificationAvatars = (items: NotificationItem[]): ((item: NotificationItem) => string | undefined) => {
    const refs = useMemo<SenderProfileRef[]>(
        () =>
            items.flatMap(item => (item.placeId && item.ownerId ? [{ sid: item.placeId, userId: item.ownerId }] : [])),
        [items]
    );
    const profiles = useSenderProfiles(refs);
    return useCallback(
        (item: NotificationItem) =>
            item.placeId && item.ownerId
                ? profiles.get(`${item.placeId}@${item.ownerId}`)?.thumbnail || undefined
                : undefined,
        [profiles]
    );
};
