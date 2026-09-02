import { useEffect, useState } from 'react';

import type { DomainChannel } from '@chatic/data';
import { getSyncManager, useRuntimeRepositories, useRuntimeSocketState } from '@chatic/app-runtime';
import { useSessionIdentity, useSessionSelection } from '@chatic/app-runtime';

import type { ReadCursor } from '../utils';

/**
 * My read boundary (`join.chatNo`, with the `join.metaNo` snapshot that nets system messages
 * out of the count) per channel, kept live.
 *
 * v2 does not keep a usable per-user `$join` on the channel record, so the unread badge needs the
 * read cursor from the join cache directly (mirrors apps/web `useChannelUnreads` + `useMyJoinsSync`):
 * register a join sync target per channel (`registerJoin` — streams the server read cursor in) and
 * observe the join cache for my row's `chatNo`. Without this the cursor never advances, so badges
 * stay frozen at whatever the eventually-consistent server `unreadCount` last said.
 *
 * Returns the cursor keyed by channelId; a channel with no join row yet is absent (→ no badge).
 * `registerJoin` refcounts by key, so the same channel observed by both the sidebar and the place
 * aggregate dedups to one sync target.
 */
export const useChannelReadCursors = (channels: DomainChannel[]): Record<string, ReadCursor> => {
    const { join: joinRepository } = useRuntimeRepositories();
    const { userId } = useSessionIdentity();
    const { selectedSiteId } = useSessionSelection();
    const { isVerified } = useRuntimeSocketState();

    const [cursorByChannel, setCursorByChannel] = useState<Record<string, ReadCursor>>({});

    // Stable key so the effect re-subscribes only when the channel id set changes.
    const channelKey = channels.map(c => c.id).join(',');

    useEffect(() => {
        if (!userId || !isVerified || channels.length === 0) return;
        const sync = getSyncManager();

        const disposers = channels.flatMap(channel => {
            const channelId = channel.id;
            if (!channelId) return [];
            const unregJoin = sync.registerJoin(`${channelId}@${userId}`);
            const unsubObserve = joinRepository.observeList({ channelId }, result => {
                const mine = (result?.list ?? []).find(j => j.userId === userId && j.channelId === channelId);
                if (!mine) return;
                const chatNo = mine.chatNo ?? 0;
                const metaNo = mine.metaNo;
                setCursorByChannel(prev => {
                    const curr = prev[channelId];
                    if (curr?.chatNo === chatNo && curr?.metaNo === metaNo) return prev;
                    return { ...prev, [channelId]: { chatNo, metaNo } };
                });
            });
            return [unregJoin, unsubObserve];
        });

        return () => disposers.forEach(dispose => dispose());
        // selectedSiteId re-scopes the join observers on a place switch — the channel set
        // now spans all places (stable across switches), so channelKey alone won't re-run.
    }, [joinRepository, userId, isVerified, channelKey, selectedSiteId]);

    return cursorByChannel;
};
