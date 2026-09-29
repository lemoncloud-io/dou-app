import { useMemo } from 'react';

import type { DomainChannel, DomainJoin } from '@chatic/data';

import { unreadOf } from '../utils/countUnread';

/** Per-channel unread message counts keyed by channel id, plus per-site and aggregate totals. */
export interface ChannelUnreads {
    /** unread count per channel id (clamped to >= 0). */
    byChannel: Record<string, number>;
    /** unread summed per owning site id (sid); a place shows a dot when its value > 0. */
    byPlace: Record<string, number>;
    /** sum of all per-channel unread counts across the active cloud. */
    total: number;
}

/**
 * Derives per-channel unread counts for the current user from the channel head plus MY read
 * cursor: the subscribed join row (see {@link useMyJoins}) or the channel-embedded `$join`,
 * whichever is further along. The join row leads right after I read here; `$join` is the only one
 * a read on another device moves while its cloud is off screen (see {@link unreadOf}).
 *
 * The formula itself (head and cursor both netted against their own `metaNo` snapshot — ADR-0048)
 * lives in {@link countUnread}, shared with the search results and the cross-cloud unread hint.
 *
 * A channel with neither (cursor unknown) counts 0 rather than flashing a full count.
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
            // The formula and the cursor choice live in unreadOf, shared with the search results.
            const unread = unreadOf(ch, joinByChannel?.get(ch.id));

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
