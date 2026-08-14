import { getGlobalSessionContext } from '@chatic/web-core';

import { useChannelChatFeeds, type ChannelChatFeed, type ChannelLastChat } from './useChannelChatFeeds';
import { isMentioned, isNotifiableChat, messagePlainText, resolveMyMentionNames } from '../utils';
import { useMentionsStore, useReadCursorStore } from '../stores';

const chatAuthorId = (chat: ChannelLastChat): string | undefined => chat.owner$?.id ?? chat.ownerId;

/**
 * Capture @me messages across every channel into the device-local mentions inbox.
 * Browser-safe (no native gate). Intentionally independent of notification mute / DND —
 * a muted channel still records its mentions (Slack parity).
 *
 * The shared feed (useChannelChatFeeds) hands us a channel's latest message whenever its
 * watermark advances. v2 only streams chat content for the focused room, so this rides the
 * channel record — meaning it sees a channel's *latest* message (rapid bursts collapse to the
 * newest). Guards mirror the OS-notification hook so a resync can't spam the inbox: skip my own
 * messages, non-mentions, and anything at/below the read cursor.
 */
export const useMentionCapture = (): void => {
    const add = useMentionsStore(s => s.add);

    useChannelChatFeeds(({ placeId, channel, chat }: ChannelChatFeed) => {
        // Flattened first: a Block Kit payload hides its text inside JSON, so both the
        // '@' pre-filter and the stored copy have to read what the message says.
        const content = messagePlainText(chat.content);
        // Cheap pre-filter: only '@'-bearing messages can mention me (or @channel/@here).
        if (!content || !content.includes('@')) return;
        // The '@' filter above catches most system rows, but a join event for a channel
        // or member whose name contains '@' slips through — and the inbox must only ever
        // hold things people wrote.
        if (!isNotifiableChat(chat)) return;

        const identity = getGlobalSessionContext().identity;
        const authorId = chatAuthorId(chat);
        const isMe = !!authorId && authorId === identity.userId;
        // Precedence: own message → not-a-mention → already-read → capture.
        if (isMe) return;
        if (!isMentioned(content, resolveMyMentionNames())) return;
        const chatNo = chat.chatNo ?? 0;
        const cursor = useReadCursorStore.getState().cursors[channel.id] ?? 0;
        if (chatNo <= cursor) return;

        add({
            id: chat.id,
            channelId: channel.id,
            chatNo: chat.chatNo,
            content,
            ownerName: chat.owner$?.name ?? '',
            ownerId: authorId,
            // owner$ carries no avatar; key the fallback color off the author id.
            colorSeed: authorId,
            placeId,
            // Thread reply → server-normalised root chatNo string; drives the
            // Activity click into the thread panel. Absent on top-level messages.
            parentId: chat.parentId,
            createdAt: Date.now(),
        });
    });
};
