import type { DomainChannel, DomainChat } from '@chatic/data';

/** A channel's latest message number, from its embedded last message or own counter. */
export const lastChatNoOf = (channel: DomainChannel): number => channel.lastChat$?.chatNo ?? channel.chatNo ?? 0;

/**
 * Merge a freshly-fetched channel list with what we already hold, keeping the
 * newer `lastChat$` per channel. The channel detail endpoint is eventually
 * consistent — right after a message arrives it can still return the channel with
 * the *previous* last message, which would wipe a just-arrived unread badge. Never
 * let a refetch regress a channel's latest message.
 */
export const mergeChannelsKeepingLatest = (prev: DomainChannel[], next: DomainChannel[]): DomainChannel[] => {
    const prevById = new Map(prev.map(channel => [channel.id, channel]));
    return next.map(channel => {
        const existing = channel.id ? prevById.get(channel.id) : undefined;
        if (existing && lastChatNoOf(existing) > lastChatNoOf(channel)) {
            return { ...channel, lastChat$: existing.lastChat$, chatNo: existing.chatNo ?? channel.chatNo };
        }
        return channel;
    });
};

/**
 * Apply a live incoming chat to a channel list — bump that channel's `lastChat$`
 * (and thus its unread badge) straight from the chat event instead of refetching.
 * The channel endpoint lags, so a refetch races the event and resets the badge;
 * this updates locally and never regresses a newer message.
 */
export const withIncomingChat = (channels: DomainChannel[], chat: DomainChat): DomainChannel[] => {
    if (!chat.channelId) return channels;
    // Runs on every incoming message; only allocate a new list when this chat
    // actually advances its channel's last message (the common case is a no-op).
    const index = channels.findIndex(channel => channel.id === chat.channelId);
    if (index < 0 || (chat.chatNo ?? 0) <= lastChatNoOf(channels[index])) return channels;
    const next = [...channels];
    next[index] = { ...next[index], lastChat$: chat, chatNo: chat.chatNo ?? next[index].chatNo };
    return next;
};
