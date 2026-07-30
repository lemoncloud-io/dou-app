import { useMemo } from 'react';

import type { DomainChannel, DomainJoin } from '@chatic/data';

import type { ChannelUnreads } from '../types';

/**
 * Derives per-channel unread counts for the current user from the channel head plus MY read
 * cursor, sourced from the subscribed join list (see {@link useMyJoins}) — NOT the channel-embedded
 * `$join`, which lags the live read state.
 *
 * The badge counts USER messages only. `channel.chatNo` is one monotonic sequence over both user
 * and system (join/leave) messages and `channel.metaNo` is the cumulative count of the system
 * (non-countable) events, so `channel.chatNo - channel.metaNo` is the user-message count at the
 * channel head. The join list's read cursor (`join.chatNo`, taken as `max(readNo, chatNo)` for the
 * freshest position) is on that same user-message scale, so:
 *
 *   unread = max(0, (channel.chatNo - channel.metaNo) - readNo)
 *
 * This nets out system messages without needing a per-cursor metaNo: the head is converted to the
 * user-message count and compared against the user-scale cursor directly.
 *
 * A channel with no join row yet (cursor unknown) counts 0 rather than flashing a full count; the
 * per-channel join sync in {@link useMyJoins} fills the cursor in shortly after mount.
 */
export const useChannelUnreads = (
    channels: DomainChannel[],
    joinByChannel?: Map<string, DomainJoin>
): ChannelUnreads => {
    return useMemo(() => {
        const byChannel: Record<string, number> = {};
        const byPlace: Record<string, number> = {};
        let total = 0;
        for (const ch of channels) {
            // Channel head in the unified user+system sequence.
            const headChatNo = ch.chatNo ?? 0;
            const headMeta = ch.metaNo ?? 0;
            // User-message count at the head (system events netted out).
            const userHead = Math.max(0, headChatNo - headMeta);

            // Read cursor from the subscribed join list. No row yet → no read boundary → no badge.
            const myJoin = joinByChannel?.get(ch.id);
            const readNo = myJoin ? Math.max(myJoin.readNo ?? 0, myJoin.chatNo ?? 0) : undefined;
            const unread = readNo === undefined ? 0 : Math.max(0, userHead - readNo);

            byChannel[ch.id] = unread;
            total += unread;
            // Bucket by owning site so a place shows a dot when any of its channels is unread.
            if (ch.sid) {
                byPlace[ch.sid] = (byPlace[ch.sid] ?? 0) + unread;
            }
        }

        return { byChannel, byPlace, total };
    }, [channels, joinByChannel]);
};
