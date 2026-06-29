import type { DomainChat } from '@chatic/data';
import { getGlobalSessionContext } from '@chatic/web-core';

import { useChannelChatFeeds, type ChannelChatFeed } from './useChannelChatFeeds';
import { isMentioned, resolveMyMentionNames } from '../utils';
import { useMentionsStore, useReadCursorStore } from '../stores';

const chatAuthorId = (chat: DomainChat): string | undefined => chat.owner$?.id ?? chat.ownerId;

// The socket chat frame may carry its origin place as `sid` (not declared on
// DomainChat). Read it best-effort: absent → the mention lands in the catch-all
// "Other workspace" group rather than its place.
const chatPlaceId = (chat: DomainChat): string | undefined => (chat as { sid?: string }).sid || undefined;

/**
 * Capture @me messages across every channel into the device-local mentions inbox.
 * Browser-safe (no native gate). Intentionally independent of notification mute / DND —
 * a muted channel still records its mentions (Slack parity).
 *
 * The shared chat-feed engine (useChannelChatFeeds) handles channel discovery, per-channel
 * sync registration and the first-snapshot baseline; it hands us only the genuinely-new
 * persisted messages per channel. Guards mirror the OS-notification hook so a resync can't spam
 * the inbox: skip my own messages, non-mentions, and anything at/below the read cursor.
 */
export const useMentionCapture = (): void => {
    const add = useMentionsStore(s => s.add);

    const captureOne = (chat: DomainChat) => {
        const content = chat.content ?? '';
        if (!content) return;
        // Cheap pre-filter: only '@'-bearing messages can mention me (or @channel/@here).
        if (!content.includes('@')) return;

        const identity = getGlobalSessionContext().identity;
        const myUid = identity.userId;
        const myId = identity.activeProfile?.identityId;
        const authorId = chatAuthorId(chat);
        const myNames = resolveMyMentionNames();
        const chatNo = chat.chatNo ?? 0;
        const cursor = useReadCursorStore.getState().cursors[chat.channelId] ?? 0;
        const isMe = !!authorId && (authorId === myId || authorId === myUid);
        const mentioned = isMentioned(content, myNames);
        // Precedence: own message → not-a-mention → already-read → capture.
        if (isMe) return;
        if (!mentioned) return;
        if (chatNo <= cursor) return;

        add({
            id: chat.id,
            channelId: chat.channelId,
            chatNo: chat.chatNo,
            content,
            ownerName: chat.owner$?.name ?? '',
            ownerId: authorId,
            // owner$ carries no avatar; key the fallback color off the author id.
            colorSeed: authorId,
            placeId: chatPlaceId(chat),
            // Thread reply → server-normalised root chatNo string; drives the
            // Activity click into the thread panel. Absent on top-level messages.
            parentId: chat.parentId,
            createdAt: chat.createdAtMs || Date.now(),
        });
    };

    useChannelChatFeeds(({ chats }: ChannelChatFeed) => {
        for (const chat of chats) captureOne(chat);
    });
};
