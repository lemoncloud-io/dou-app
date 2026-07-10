import { useEffect, useRef, useState } from 'react';

import type { DomainChat } from '@chatic/data';

import { useChatSync, useRuntimeRepositories } from '@chatic/app-runtime';

// Observe a small window (not just the newest row) so the preview can fall through to
// the previous MAIN message when the newest rows are thread replies or system
// (join/leave) chats — neither may surface as a channel's last-message preview.
const PREVIEW_LOOKBACK = 20;

/**
 * A message worth previewing: not a thread reply (`parentId`) — the main feed hides
 * those too (ChatPane: `!m.parentId`) — and, additionally, not a system (join/leave)
 * row, so a channel's preview line is always a real message.
 */
const isPreviewable = (chat: DomainChat): boolean => !chat.parentId && chat.stereo !== 'system';

/**
 * Last MAIN-channel message for a desktop channel-list row's preview. The channel
 * record's `lastChat$` is whatever the newest chat is — thread replies included — so
 * it can't drive a "main chat only" preview (and holds just that one message, with no
 * way to fall back to the previous main one). Instead compose the app-runtime chat
 * primitives like the room's `useChats`: `useChatSync` registers + primes the chat
 * target, `chat.observeList` streams the cache, and the freshness bridge pulls the
 * newest page when the channel record runs ahead of the cache (desktop chat sync can't
 * deliver mid-session messages — see `useChats`).
 *
 * Picks the highest-chatNo previewable row, so thread replies and system rows are
 * skipped and the preview keeps showing the last actual main message.
 */
export const useLastChat = (channelId: string, latestChatNo?: number): DomainChat | undefined => {
    const { chat: chatRepository } = useRuntimeRepositories();
    const [lastChat, setLastChat] = useState<DomainChat | undefined>(undefined);
    // Newest chatNo present in the observed window (any kind), so the freshness bridge
    // can tell whether the cache already holds the channel record's latest message.
    const cachedNewestRef = useRef(0);

    useChatSync(channelId || undefined);

    useEffect(() => {
        if (!channelId) {
            setLastChat(undefined);
            cachedNewestRef.current = 0;
            return;
        }
        return chatRepository.observeList({ channelId, limit: PREVIEW_LOOKBACK }, result => {
            const list = result?.list ?? [];
            let newest = 0;
            let best: DomainChat | undefined;
            for (const chat of list) {
                const no = chat.chatNo ?? 0;
                if (no > newest) newest = no;
                if (isPreviewable(chat) && no >= (best?.chatNo ?? -1)) best = chat;
            }
            cachedNewestRef.current = newest;
            setLastChat(best);
        });
    }, [chatRepository, channelId]);

    // Freshness bridge (mirrors useChats): desktop chat sync can't push mid-session
    // messages, so when the channel record's newest chatNo runs ahead of the cache,
    // fetch the newest page. Guarded per (channel, chatNo) so a thread-only advance the
    // feed can't surface isn't refetched every render.
    const freshnessRef = useRef<{ id: string; no: number }>({ id: '', no: 0 });
    useEffect(() => {
        if (!channelId || !latestChatNo || latestChatNo <= cachedNewestRef.current) return;
        if (freshnessRef.current.id === channelId && freshnessRef.current.no >= latestChatNo) return;
        freshnessRef.current = { id: channelId, no: latestChatNo };
        void chatRepository.refreshList({ channelId, limit: PREVIEW_LOOKBACK }).catch(() => undefined);
    }, [chatRepository, channelId, latestChatNo]);

    return lastChat;
};
