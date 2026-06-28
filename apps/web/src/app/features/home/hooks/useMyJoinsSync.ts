import { useEffect } from 'react';

import { getSyncManager, useSocketState } from '@chatic/app-runtime';
import { useSessionIdentity } from '@chatic/web-core';

/**
 * Registers the current user's join (read-state) sync for every given channel id — keyed
 * `${channelId}@${uid}`, the canonical join id used by readChat and useJoinPositions. Driven
 * from the home page with the active place's full channel list, this keeps my readNo live
 * across all of that place's channels so the unread badges (useChannelUnreads) update in real
 * time, not just for the rows scrolled into view.
 *
 * registerJoin refcounts by key, so entering a room (which registers the same id via
 * useJoinPositions) dedups. Gated on isVerified — runs against the current session and
 * auto-retries after re-auth. Re-registers only when the channel id set changes.
 */
export const useMyJoinsSync = (channelIds: string[]): void => {
    const { isVerified } = useSocketState();
    const { userId } = useSessionIdentity();

    // Join into a stable dependency so the effect only re-runs on a real channel-set change.
    const key = channelIds.join(',');

    useEffect(() => {
        if (!isVerified || !userId || channelIds.length === 0) return;
        const sync = getSyncManager();
        const disposers = channelIds.map(channelId => sync.registerJoin(`${channelId}@${userId}`));
        return () => disposers.forEach(dispose => dispose());
        // key captures the channel id set; channelIds is read once per key.
    }, [isVerified, userId, key]);
};
