import { useCallback, useMemo } from 'react';

import { useSenderProfiles, type SenderProfileRef } from '../../../hooks/useSenderProfiles';
import type { NotificationItem } from '../../../utils/notifications';

/**
 * The author photo for each inbox item, from its author's profile in the item's place.
 *
 * An item is worked out from a cached chat row, which carries the author's id and name but no
 * photo; the photo lives on the place profile. Search has the same problem for its chat results,
 * so this reads through the same `useSenderProfiles`: the cache first, one fetch per author it does
 * not hold, one subscription per place for the whole list, and no poll — a room the reader has not
 * opened registers no profile sync, and the inbox should not start one per author.
 *
 * An item with no place (a relay 1:1) or no author id has no profile to read and keeps the
 * default glyph.
 */
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
