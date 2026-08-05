import { useEffect, useRef, useState } from 'react';

import type { DomainChat } from '@chatic/data';

import { useChatSync, useRuntimeRepositories } from '@chatic/app-runtime';

import { pickPreviewChat } from '../utils';

// Observe a small window (not just the newest row) so the preview can fall through to
// the previous MAIN message when the newest rows are thread replies, reaction events or
// system (join/leave) chats — none of those may surface as a channel's preview.
const PREVIEW_LOOKBACK = 20;

/**
 * Last previewable message for a desktop channel-list row: its preview line and its
 * time. The channel record's `lastChat$` is whatever the newest chat is — thread
 * replies and reaction events included — so it can't drive a "real messages only"
 * preview, and it holds just that one message, with no way to fall back to the previous
 * one. Instead compose the app-runtime chat primitives like the room's `useChats`:
 * `useChatSync` registers + primes the chat target, `chat.observeList` streams the
 * cache, and the freshness bridge pulls the newest page when the channel record runs
 * ahead of the cache (desktop chat sync can't deliver mid-session messages — see
 * `useChats`).
 *
 * Which row wins is `pickPreviewChat`'s decision, taken from the same rule the feed
 * renders by.
 */
export const useLastChat = (channelId: string, latestChatNo?: number): DomainChat | undefined => {
    const { chat: chatRepository } = useRuntimeRepositories();
    const [lastChat, setLastChat] = useState<DomainChat | undefined>(undefined);
    // Newest SERVER-assigned chatNo in the observed window, so the freshness bridge can
    // tell whether the cache already holds the channel record's latest message. A
    // pending send's sentinel 0 must not count here: ranked as newest it would park this
    // above `latestChatNo` and the bridge would stop fetching altogether.
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
            cachedNewestRef.current = list.reduce((newest, chat) => Math.max(newest, chat.chatNo ?? 0), 0);
            setLastChat(pickPreviewChat(list));
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
