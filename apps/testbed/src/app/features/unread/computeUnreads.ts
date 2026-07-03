import type { DomainChannel } from '@chatic/data';

import type { UnreadAggregates } from './types';

/**
 * Derives every unread aggregate the home surface needs in a single pass over the active
 * cloud's full channel list, so channel badges, site dots, and the cloud total can never
 * disagree — they are all projections of the same computation.
 *
 * Per-channel unread counts USER messages only: unread = max(0, (latestChatNo - myReadNo) -
 * systemInWindow). latestChatNo is the channel's last chat number (lastChat$.chatNo, falling back
 * to channel.chatNo) and myReadNo is the read boundary carried inline as `$join.chatNo`. Presence
 * of `$join` is the "has a read boundary" signal: a channel whose `$join` hasn't synced yet counts
 * as 0 (no badge) rather than flashing a full count.
 *
 * `chatNo` is one monotonic sequence over both user and system (join/leave) messages, so the raw
 * delta lets system events inflate the badge. `channel.metaNo` is the cumulative count of
 * non-countable (system) events, so the system events inside the unread window are
 * (latestMeta - readMeta), where readMeta is metaNo at the read cursor. Subtracting that leaves the
 * user-message count. When the server doesn't carry metaNo on the join cursor yet, readMeta falls
 * back to latestMeta → correction 0 → the previous behavior (safe: never over/under-counts).
 */
export const computeUnreads = (channels: DomainChannel[]): UnreadAggregates => {
    const byChannel: Record<string, number> = {};
    const byPlace: Record<string, number> = {};
    let total = 0;

    for (const ch of channels) {
        const latestChatNo = ch.lastChat$?.chatNo ?? ch.chatNo ?? 0;
        const latestMeta = ch.metaNo ?? 0;
        // Distinguish "no read boundary yet" (no $join → no badge) from "joined, read up to
        // chatNo (default 0)" so an unsynced channel never flashes a full-count badge.
        const readNo = ch.$join ? (ch.$join.chatNo ?? 0) : undefined;
        // metaNo at the read cursor. The published JoinModel type doesn't expose it yet (server
        // delivers it on the join payload), so read it defensively; absent → latestMeta (no-op).
        const readMeta = ch.$join ? ((ch.$join as { metaNo?: number }).metaNo ?? latestMeta) : 0;
        // System events within (readNo, latest]. Clamp to >= 0 so a stale readMeta can't add to it.
        const systemInWindow = Math.max(0, latestMeta - readMeta);
        const unread = readNo === undefined ? 0 : Math.max(0, latestChatNo - readNo - systemInWindow);

        byChannel[ch.id] = unread;
        total += unread;

        // Bucket by owning site for site dots. Channels always carry `sid`; skip the rare
        // untagged row rather than collapse it into a bogus "" site bucket.
        if (ch.sid) {
            byPlace[ch.sid] = (byPlace[ch.sid] ?? 0) + unread;
        }
    }

    return { byChannel, byPlace, total };
};
