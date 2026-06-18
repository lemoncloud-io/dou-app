import { useEffect } from 'react';

import type { DomainChat } from '@chatic/data';
import { useWebCoreStore } from '@chatic/web-core';
import { useRepositories } from '@chatic/app-runtime';

import { isMentioned, resolveMyMentionNames } from '../utils';
import { useMentionsStore, useReadCursorStore } from '../stores';

const chatAuthorId = (chat: DomainChat): string | undefined => chat.owner$?.id ?? chat.ownerId;

// The socket chat frame may carry its origin place as `sid` (not declared on
// DomainChat). Read it best-effort: absent → the mention lands in the catch-all
// "Other workspace" group rather than its place. An exact value would need a
// channelId→channel.sid cache lookup, too heavy for this per-message callback.
const chatPlaceId = (chat: DomainChat): string | undefined => (chat as { sid?: string }).sid || undefined;

/**
 * Capture @me messages across every channel into the device-local mentions
 * inbox. Browser-safe (no native gate): onChatCreated fires from the live WS
 * cache for all subscribed channels. Intentionally independent of notification
 * mute / DND — a muted channel still records its mentions (Slack parity).
 *
 * Guards mirror the OS-notification hook so a resync can't spam the inbox:
 * skip my own messages, non-mentions, and anything at/below the read cursor.
 */
export const useMentionCapture = (): void => {
    const { chat: chatRepository } = useRepositories();
    const add = useMentionsStore(s => s.add);

    useEffect(() => {
        return chatRepository.onChatCreated((chat: DomainChat) => {
            const content = chat.content ?? '';
            if (!content) return;
            // Cheap pre-filter: only '@'-bearing messages can mention me (or
            // @channel/@here). Skips the profile read + name resolution for the
            // overwhelming majority of traffic that carries no '@'.
            if (!content.includes('@')) return;

            const profile = useWebCoreStore.getState().profile;
            const authorId = chatAuthorId(chat);
            // Never capture my own message.
            if (authorId && (authorId === profile?.id || authorId === profile?.uid)) return;
            // Only messages that @-mention me (or @channel/@here).
            if (!isMentioned(content, resolveMyMentionNames())) return;
            // Don't re-capture an already-read message (resync redelivery).
            const chatNo = chat.chatNo ?? 0;
            if (chatNo <= (useReadCursorStore.getState().cursors[chat.channelId] ?? 0)) return;

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
                createdAt: chat.createdAtMs || Date.now(),
            });
        });
    }, [chatRepository, add]);
};
