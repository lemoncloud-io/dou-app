import { useMemo } from 'react';

import type { DomainChannel } from '@chatic/data';

import type { ChannelUnreads } from '../types';

/**
 * Derives per-channel unread counts for the current user, straight from each channel row.
 *
 * unread(channel) = max(0, latestChatNo - myReadNo), where latestChatNo is the channel's last
 * chat number (lastChat$.chatNo, falling back to channel.chatNo) and myReadNo is my read
 * boundary carried inline on the channel as `$join.chatNo`. Channel sync responses embed the
 * current user's `$join`, so we read it directly instead of observing the join cache and
 * registering a separate per-channel join sync. Presence of `$join` is the "has a read
 * boundary" signal: a channel whose `$join` hasn't synced yet shows no badge (undefined,
 * counted as 0) by design, while a synced `$join` with no chatNo reads as 0 (all unread).
 *
 * No join subscription is needed here: a read advances the server's `$join.chatNo` on the next
 * channel sync (sending the read triggers one), so the badge clears on its own.
 */
export const useChannelUnreads = (channels: DomainChannel[]): ChannelUnreads => {
    return useMemo(() => {
        const byChannel: Record<string, number> = {};
        let total = 0;
        for (const ch of channels) {
            const latestChatNo = ch.lastChat$?.chatNo ?? ch.chatNo ?? 0;
            // Distinguish "no read boundary yet" (no $join → no badge) from "joined, read up to
            // chatNo (default 0)" so an unsynced channel never flashes a full-count badge.
            const readNo = ch.$join ? (ch.$join.chatNo ?? 0) : undefined;

            const unread = readNo === undefined ? 0 : Math.max(0, latestChatNo - readNo);
            byChannel[ch.id] = unread;
            total += unread;
        }

        return { byChannel, total };
    }, [channels]);
};
