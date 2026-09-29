import { useEffect, useState } from 'react';

import { RELAY_CLOUD_ID } from '@chatic/data';
import type { DomainChannel } from '@chatic/data';
import { runtime } from '@chatic/app-runtime';

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
 *
 * The join ids are `<channel>@<uid>`, and the uid is the one this account has in the channels'
 * own cloud — every cloud gives it a different one, and the session uid is only right once that
 * cloud is committed — with the targets registered for that cloud by name.
 */
export const useChannelReadCursors = (channels: DomainChannel[]): Record<string, ReadCursor> => {
    const { join: joinRepository } = runtime.data.useRuntimeRepositories();
    const { selectedSiteId } = runtime.session.useSessionSelection();
    // The list is one partition's read (useChannels observes a single cloud), so its first row
    // names the cloud of all of them.
    const cid = channels[0]?.cid || RELAY_CLOUD_ID;
    const userId = runtime.session.useUidInCloud(cid);
    // That cloud's slot, which is the one its targets run on — not whichever slot is active.
    const isVerified = runtime.connection.useCloudVerified(cid);

    const [cursorByChannel, setCursorByChannel] = useState<Record<string, ReadCursor>>({});

    // Stable key so the effect re-subscribes only when the channel id set changes.
    const channelKey = channels.map(c => c.id).join(',');

    useEffect(() => {
        if (!userId || !isVerified || channels.length === 0) return;
        const sync = runtime.sync.getSyncManager();

        const disposers = channels.flatMap(channel => {
            const channelId = channel.id;
            if (!channelId) return [];
            const unregJoin = sync.registerJoin(`${channelId}@${userId}`, undefined, { cid });
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
        // userId is the uid in `cid`: a target only runs while it matches the uid it was
        // registered under, so an account change there has to re-register it.
    }, [joinRepository, cid, userId, isVerified, channelKey, selectedSiteId]);

    return cursorByChannel;
};
