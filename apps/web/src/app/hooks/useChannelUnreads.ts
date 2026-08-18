import { useMemo } from 'react';

import type { DomainChannel, DomainJoin } from '@chatic/data';

import { countUnread, readCursorOf } from '../utils/countUnread';

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
 * cursor, sourced from the subscribed join list (see {@link useMyJoins}) — NOT the channel-embedded
 * `$join`, which lags the live read state.
 *
 * The formula itself (head and cursor both netted against their own `metaNo` snapshot — ADR-0048)
 * lives in {@link countUnread}, shared with the search results and the cross-cloud unread hint.
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
            // Read cursor from the subscribed join list. No row yet → no read boundary → no badge.
            // The formula itself lives in countUnread, shared with the search results.
            const join = joinByChannel?.get(ch.id);
            const unread = countUnread({
                headChatNo: ch.chatNo,
                headMetaNo: ch.metaNo,
                readNo: readCursorOf(join),
                readMetaNo: join?.metaNo,
            });

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
