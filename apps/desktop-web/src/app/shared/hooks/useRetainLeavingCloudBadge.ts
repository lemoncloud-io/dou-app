import { useEffect, useRef } from 'react';

import { useGlobalSession } from '@chatic/app-runtime';

import { useCloudPushBadgeStore } from '../stores';

/**
 * Keep a cloud's rail dot after you switch away from it while it still has unread.
 *
 * Per-cloud unread is only computed for the ACTIVE cloud — the live socket covers
 * just that one (see usePlaceUnreadCounts), so leaving a cloud immediately drops
 * its unread badge even though the messages are still unread. On a cloud change,
 * snapshot the cloud being left: if it still had unread, mark it in the push-badge
 * store so its tile keeps the dot until it's revisited (where the active
 * aggregation takes over) and read — at which point useCrossCloudPushBadge clears
 * it on the verified switch.
 */
export const useRetainLeavingCloudBadge = (unreadTotal: number): void => {
    // `cloudId` is gone from socket state in v2 — derive the active cloud from the session.
    const session = useGlobalSession();
    const cloudId = session.activeServer.kind === 'cloud' ? session.activeServer.cloudId : null;
    const mark = useCloudPushBadgeStore(s => s.mark);
    const prev = useRef<{ id: string | null; unread: number }>({ id: null, unread: 0 });

    useEffect(() => {
        const { id, unread } = prev.current;
        if (id && id !== cloudId && unread > 0) mark(id);
        prev.current = { id: cloudId, unread: unreadTotal };
    }, [cloudId, unreadTotal, mark]);
};
