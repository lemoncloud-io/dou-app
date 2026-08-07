import { useEffect, useRef, useState } from 'react';

import { useChatSync, useRuntimeRepositories, useRuntimeSocketState } from '@chatic/app-runtime';
import type { DomainChat } from '@chatic/data';

import { pickPreviewChat } from '../utils';

// Observe several rows (not just 1) so the preview can fall through to the previous message when
// the newest rows are not previewable — system rows (e.g. the join written right after creating
// a channel), reaction events, thread replies, failed sends. If every row in the window is
// hidden, the preview falls back to the channel description as before.
//
// 30, not 10: reactions arrive as their own rows, so a burst of them on one message can fill a
// 10-row window end to end and leave `lastChat` undefined — a channel with a live conversation
// then reads as an empty one, with no preview and no time (ADR-0047 decision 3). The cost is
// multiplied by the number of home rows, so this is the first thing to walk back if home entry
// starts to feel slow.
const PREVIEW_LOOKBACK = 30;

/**
 * Latest cached chat for a home row's last-message preview — the home analog of `useChats`. The
 * server no longer embeds `lastChat$` on the channel, so this composes the app-runtime primitives:
 * `useChatSync` registers + primes the chat target (ChatSyncPlan keeps it live and unregisters on
 * unmount), and `chat.observeList` streams the cache. observeList is chat_no-descending, but
 * `pickPreviewChat` ranks defensively (compareByChatNo) so a different ordering can't surface an
 * older message. Non-previewable rows — system events (own or not), reaction events, thread
 * replies, failed sends — are skipped, mirroring the room view's feed filter (ADR-0045).
 *
 * Live freshness: the ChatSyncPlan is push-driven (`chat.sync`), but that push is scoped to the
 * actively-viewed room (device.sync viewing target), so a home row's chat target receives no delta
 * after its initial prime — the preview would otherwise freeze. The channel sync polls `channel.get`
 * and keeps `channel.chatNo` fresh, so we observe that head and pull the newest page whenever it
 * moves past our cached tail. This is the head-driven equivalent of the plan's reconnect catch-up
 * and restores the poll-driven freshness the embedded `lastChat$` used to provide.
 */
export const useLastChat = (channelId: string): DomainChat | undefined => {
    const { chat: chatRepository, channel: channelRepository } = useRuntimeRepositories();
    const { isVerified } = useRuntimeSocketState();
    const [lastChat, setLastChat] = useState<DomainChat | undefined>(undefined);

    // Highest chatNo currently in the chat cache for this channel (any type, incl. system) — the
    // refetch trigger compares the channel head against this. `requestedNoRef` tracks the last head
    // we kicked a fetch for so a head that hasn't landed yet can't spawn duplicate fetches.
    const cachedMaxRef = useRef(0);
    const requestedNoRef = useRef(0);

    useChatSync(channelId);

    useEffect(() => {
        if (!channelId) return;
        return chatRepository.observeList({ channelId, limit: PREVIEW_LOOKBACK }, result => {
            const list = result?.list ?? [];
            cachedMaxRef.current = list.reduce((max, chat) => Math.max(max, chat.chatNo ?? 0), 0);
            // pickPreviewChat drops reaction events, thread replies, system rows (own or not)
            // and failed sends — without it another user's reaction would take over the row as
            // the "last message" (ADR-0045) — and ranks by compareByChatNo so a just-sent
            // pending row (sentinel chatNo 0) still previews instead of losing every numeric
            // comparison.
            setLastChat(pickPreviewChat(list));
        });
    }, [chatRepository, channelId]);

    // Pull the newest page when the (poll-fresh) channel head advances past the cached tail. Gated on
    // isVerified so it (re)runs after auth/reconnect; requestedNoRef dedupes so one head bump fires at
    // most one fetch. The observeList above updates cachedMaxRef once the fetched rows land.
    useEffect(() => {
        if (!channelId || !isVerified) return;
        return channelRepository.observeItem(channelId, channel => {
            const head = channel?.chatNo ?? 0;
            if (head > cachedMaxRef.current && head > requestedNoRef.current) {
                requestedNoRef.current = head;
                void chatRepository.refreshList({ channelId }).catch(() => undefined);
            }
        });
    }, [channelRepository, chatRepository, channelId, isVerified]);

    return lastChat;
};
