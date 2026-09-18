import { useEffect, useMemo, useState } from 'react';

import { runtime } from '@chatic/app-runtime';
import { isInJoinWindow } from '@chatic/data';
import type { DomainChannel, DomainChat, DomainJoin } from '@chatic/data';

/**
 * The "last message preview" for the whole home channel list — a list-level replacement for the
 * per-row `useLastChat` (ADR-0057).
 *
 * This is a pure cache observation: instead of subscribing to a 30-row window per channel, it reads
 * through a single `chat.observeLastList` (on newer app versions the whole list is one bridge
 * round-trip; older apps and the browser fall back to the data source doing per-channel windows).
 * **No network call is made here** — loading recent messages into the cache is managed separately,
 * outside this screen (native's background message loading), and that write re-wakes this
 * observation via the `chats-last` relimit. The list simply mirrors whatever last message the cache
 * reports.
 *
 * There's exactly one thing it filters out: when `joinByChannel` is given, it does not use a row
 * that predates **my current join** as the preview (ADR-0067). Because a channel's chat cache
 * survives even after leaving it, this stops a re-joined channel from carrying an old message as its
 * preview that the server no longer sends. A filtered-out channel ends up with no preview, and
 * `sortChannels` then places it among channels with no activity time — the correct state right after
 * rejoining.
 */
export const useLastChats = (
    channels: DomainChannel[],
    joinByChannel?: Map<string, DomainJoin>
): Map<string, DomainChat> => {
    const { chat: chatRepository } = runtime.data.useRuntimeRepositories();

    const [lastByChannel, setLastByChannel] = useState<Map<string, DomainChat>>(new Map());

    // Sorted-and-joined key: keeps a sort change (pin/recency) that only reorders the same set from
    // triggering a re-subscribe.
    const channelKey = useMemo(
        () =>
            channels
                .map(channel => channel.id)
                .filter(Boolean)
                .sort()
                .join(','),
        [channels]
    );

    useEffect(() => {
        if (!channelKey) {
            setLastByChannel(new Map());
            return;
        }
        const channelIds = channelKey.split(',');
        return chatRepository.observeLastList(channelIds, rows => {
            const nextLast = new Map<string, DomainChat>();
            for (const row of rows) {
                if (row.chat) nextLast.set(row.channelId, row.chat);
            }
            setLastByChannel(nextLast);
        });
    }, [chatRepository, channelKey]);

    // The join window is applied here rather than inside the subscription: `joinByChannel` is a new
    // Map on most renders, and making the observer depend on it would tear down and re-open the
    // subscription for the whole list every time a read cursor moves.
    return useMemo(() => {
        if (!joinByChannel?.size) return lastByChannel;
        const visible = new Map<string, DomainChat>();
        for (const [channelId, chat] of lastByChannel) {
            if (isInJoinWindow(chat, joinByChannel.get(channelId)?.joinedNo)) visible.set(channelId, chat);
        }
        return visible;
    }, [lastByChannel, joinByChannel]);
};
