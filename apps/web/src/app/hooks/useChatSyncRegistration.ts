import { useEffect, useRef, useState } from 'react';

import { getSyncManager, useRuntimeRepositories, useRuntimeSocketState } from '@chatic/app-runtime';
import type { DomainChannel } from '@chatic/data';

/**
 * Page size of a head-triggered catch-up. Deep enough to reach a real message when the newest rows
 * are not previewable (a reaction burst) — the same reasoning as the preview fallback window.
 */
const CATCH_UP_LIMIT = 30;

/**
 * Registers a chat (message) sync for every channel of the ACTIVE site, for as long as the calling
 * surface is mounted — the chat-domain sibling of {@link useJoinSyncRegistration}.
 *
 * Why home needs this at all: the home list only ever READS the chat cache (`useLastChats` is a
 * pure observation, ADR-0057), so a row repaints when — and only when — something writes a newer
 * message into that cache. Inside a room `useChatSync` is that writer; on home nobody was, so the
 * previews (and the activity order derived from them) sat still until the room was opened.
 *
 * Two mechanisms, because `ChatSyncPlan.run` is a no-op — registering alone loads nothing:
 *
 * 1. **Target registration** — `registerChat(channelId)` per channel. A `chat.sync` frame is
 *    dispatched to every registered chat target (each filters by its own channelId), so a message
 *    arriving in any of the site's channels is appended live, and a reconnect catches the target up
 *    from its baseline. `registerChat` refcounts by key, so the room's own registration for the
 *    channel being viewed dedups into this one rather than doubling it.
 * 2. **Head-triggered catch-up** — a channel whose polled head (`channel.chatNo`, kept fresh by the
 *    per-row `useChannelSync` and the cloud-wide `syncChannels` delta) runs ahead of what the chat
 *    cache holds gets one small page pulled. This is the convergence guarantee: it does not care
 *    whether the push was delivered, missed, or scoped away, and it fires only for channels that
 *    genuinely moved — a warm list costs nothing.
 *
 * The catch-up deliberately lives HERE, in a sync-registration hook the surface owns, and not in
 * the list component: the list must stay a pure cache read so rendering a row can never be the
 * thing that makes a network call.
 *
 * Baseline: the plan's `lastNo` is aligned from the same combined last-chat observation the list
 * already runs (identical channel set → identical observer key → the read is shared, not doubled).
 * Without it the first push after a cold start reads as a gap and re-fetches the newest page per
 * channel. Only `lastNo` is patched — the plan merges the patch over its snapshot, so an open
 * room's message window is left intact.
 */
export const useChatSyncRegistration = (
    channels: DomainChannel[],
    { enabled = true }: { enabled?: boolean } = {}
): void => {
    const { chat: chatRepository } = useRuntimeRepositories();
    const { isVerified } = useRuntimeSocketState();

    // Sorted-and-joined key: a reorder (pin / activity sort) must not re-register or re-subscribe,
    // and the sorted ids match the key `useLastChats` observes under, so the two share one read.
    const channelKey = [...channels.map(channel => channel.id).filter(Boolean)].sort().join(',');

    useEffect(() => {
        if (!enabled || !isVerified || !channelKey) return;
        const sync = getSyncManager();
        const disposers = channelKey.split(',').map(id => sync.registerChat(id));
        return () => disposers.forEach(dispose => dispose());
    }, [channelKey, enabled, isVerified]);

    // Per-channel max chatNo held by the chat cache — the baseline source AND the catch-up's
    // comparison point. `null` until the first observation lands, which locks the trigger: with no
    // comparison point in hand, a head would otherwise read as "behind" on a warm cache too.
    const [lastNoByChannel, setLastNoByChannel] = useState<Map<string, number> | null>(null);
    // Heads already fetched for, per channel — one head fires at most one request, even when the
    // response cannot advance lastNo (every new row a reaction or a thread reply).
    const requestedNoRef = useRef(new Map<string, number>());

    useEffect(() => {
        requestedNoRef.current.clear();
        setLastNoByChannel(null);
        if (!enabled || !channelKey) return;
        return chatRepository.observeLastList(channelKey.split(','), rows => {
            const nextNos = new Map<string, number>();
            for (const row of rows) nextNos.set(row.channelId, row.lastNo);
            setLastNoByChannel(nextNos);
        });
    }, [chatRepository, channelKey, enabled]);

    useEffect(() => {
        if (!enabled || !isVerified || !lastNoByChannel) return;
        const sync = getSyncManager();
        for (const [channelId, lastNo] of lastNoByChannel) {
            sync.updateLocalSnapshot({ type: 'chat', id: channelId }, { id: channelId, lastNo });
        }
    }, [enabled, isVerified, lastNoByChannel]);

    useEffect(() => {
        if (!enabled || !isVerified || !lastNoByChannel) return;
        for (const channel of channels) {
            if (!channel.id) continue;
            const head = channel.chatNo ?? 0;
            const known = lastNoByChannel.get(channel.id) ?? 0;
            const requested = requestedNoRef.current.get(channel.id) ?? 0;
            if (head <= known || head <= requested) continue;
            requestedNoRef.current.set(channel.id, head);
            // The fetched page lands via cacheWriteMany → `chats-last` re-emit → the list repaints
            // and this effect re-runs with the advanced lastNo.
            void chatRepository.refreshList({ channelId: channel.id, limit: CATCH_UP_LIMIT }).catch(() => undefined);
        }
        // lastNoByChannel is also the unlock signal: the first observation must re-run this effect
        // to process heads that arrived while the trigger was locked.
    }, [channels, lastNoByChannel, enabled, isVerified, chatRepository]);
};
