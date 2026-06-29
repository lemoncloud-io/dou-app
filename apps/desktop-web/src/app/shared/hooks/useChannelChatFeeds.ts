import { useEffect, useRef } from 'react';

import type { DomainChannel, DomainChat } from '@chatic/data';
import { getSyncManager, useRuntimeRepositories, useSocketState } from '@chatic/app-runtime';

import { usePlaces } from './usePlaces';

// Newest rows observed per channel — large enough that a burst of arrivals between
// emissions isn't truncated below the previous baseline, and enough to skip the optimistic
// own-message sentinel (which sorts to the descending-order top) and still see real messages.
const CHAT_FEED_LIMIT = 50;

// Optimistic own messages carry a sentinel chatNo (Number.MAX_SAFE_INTEGER) so they sort to
// the bottom (ChatRepository). They must NOT drive the baseline: counting one pins `seen` to
// MAX, after which every real message reads as top <= prev and the channel goes permanently
// silent (mirrors apps/web useChats).
const isPersisted = (chat: DomainChat): boolean =>
    typeof chat.chatNo === 'number' && chat.chatNo > 0 && chat.chatNo !== Number.MAX_SAFE_INTEGER;
const maxChatNo = (list: DomainChat[]): number => list.reduce((max, c) => Math.max(max, c.chatNo ?? 0), 0);

/** A channel's genuinely-new persisted messages for one observe emission. */
export interface ChannelChatFeed {
    placeId: string;
    channel: DomainChannel;
    /** Persisted messages strictly above the channel's previous high-water mark. */
    chats: DomainChat[];
}

/**
 * Shared per-channel chat-subscription engine for desktop features (OS notifications and the
 * @-mention inbox). Owns ONCE the scaffold both features need so the engine isn't built — and
 * each channel registered/observed — twice.
 *
 * For every place the signed-in user belongs to it observes the channel list
 * (`channel.observeList`) and, per channel, registers a chat sync target
 * (`getSyncManager().registerChat`) so the socket streams that channel's messages into the
 * cache, then observes that cache (`chat.observeList`). Subscriptions are reconciled
 * incrementally as the channel set changes — added for new channels, disposed for vanished
 * ones — never torn down per message.
 *
 * A per-channel high-water baseline makes the first (cache warm-up) snapshot a no-op: `onChats`
 * fires only when an emission advances the baseline, carrying just the messages above the
 * previous mark (so optimistic own sentinels and re-delivered cache pages don't re-emit).
 *
 * Browser-safe: no native gate, no feature policy. Callers add their own gates (DND, mute,
 * native-shell, own-message, mention filtering) inside the callback.
 */
export const useChannelChatFeeds = (onChats: (feed: ChannelChatFeed) => void): void => {
    const { channel: channelRepository, chat: chatRepository } = useRuntimeRepositories();
    const { places } = usePlaces();
    const { isVerified } = useSocketState();

    // Per-channel high-water mark of the newest persisted chatNo already emitted.
    const seen = useRef<Map<string, number>>(new Map());
    // Read the callback at emit time via a ref so an unstable callback identity doesn't re-run
    // the effect (which would drop every live subscription).
    const onChatsRef = useRef(onChats);
    onChatsRef.current = onChats;

    // Join the place ids into a stable dependency so the effect re-runs only when the set changes.
    const placeIds = places.map(p => p.id).join(',');

    useEffect(() => {
        if (!isVerified || places.length === 0) return;
        let active = true;
        const sync = getSyncManager();

        // channelId → teardown bundle (chat sync registration + chat observe).
        const subs = new Map<string, () => void>();
        // placeId → channel ids currently observed for that place (to detect removals).
        const byPlace = new Map<string, Set<string>>();

        const emitFromList = (placeId: string, channel: DomainChannel, list: DomainChat[]) => {
            // Drop optimistic own messages (sentinel chatNo) up front so they never touch the
            // baseline — otherwise sending poisons `seen` and the channel goes silent.
            const persisted = list.filter(isPersisted);
            if (persisted.length === 0) return;

            const top = maxChatNo(persisted);
            const prev = seen.current.get(channel.id);
            // Monotonic: a partial snapshot (resync, page-limited cache read) must not regress
            // the baseline, or the next full snapshot reads as "new" messages.
            if (prev === undefined || top > prev) seen.current.set(channel.id, top);

            // Skip the first snapshot (cache warm-up) — only emit on a real increase.
            if (prev === undefined || top <= prev) return;

            // Carry only the genuinely-new messages (above the previous high-water mark).
            const fresh = persisted.filter(c => (c.chatNo ?? 0) > prev);
            onChatsRef.current({ placeId, channel, chats: fresh });
        };

        // Subscribe a channel's chat stream once. Deduped, so reconciling the channel list can't
        // thrash subscriptions. registerChat drives the socket to stream this channel's messages
        // into the cache; observeList reads them back.
        const ensureSub = (placeId: string, channel: DomainChannel) => {
            if (!channel.id || subs.has(channel.id)) return;
            const channelId = channel.id;
            const unregChat = sync.registerChat(channelId);
            const unsubChat = chatRepository.observeList({ channelId, limit: CHAT_FEED_LIMIT }, result =>
                emitFromList(placeId, channel, result?.list ?? [])
            );
            subs.set(channelId, () => {
                unsubChat();
                unregChat();
            });
        };

        // Observe each place's channel list; reconcile the chat subscriptions on every emission.
        // Channels that appear later (e.g. after a cloud switch) get a stream added; deleted
        // channels release theirs. Seed discovery so the cache is warm even before the next
        // background-sync tick.
        const channelObservers = places.map(place => {
            void channelRepository.refreshList({ sid: place.id }).catch(() => undefined);
            return channelRepository.observeList({ sid: place.id }, result => {
                if (!active) return;
                // The relay cache is not sid-isolated, so filter to this place.
                const list = ((result?.list ?? []) as DomainChannel[]).filter(c => c.sid === place.id);
                const nextIds = new Set(list.map(c => c.id).filter((id): id is string => !!id));
                const prevIds = byPlace.get(place.id) ?? new Set<string>();
                for (const id of prevIds) {
                    if (!nextIds.has(id)) {
                        subs.get(id)?.();
                        subs.delete(id);
                    }
                }
                list.forEach(channel => ensureSub(place.id, channel));
                byPlace.set(place.id, nextIds);
            });
        });

        return () => {
            active = false;
            channelObservers.forEach(unsub => unsub());
            subs.forEach(fn => fn());
            subs.clear();
            byPlace.clear();
            // Channel ids are per-cloud sequential numbers and collide across clouds, so a
            // baseline kept across a cloud switch can be regressed by the other cloud's same-id
            // channel — resurfacing an already-read message. Drop baselines with the subs; the
            // first-snapshot guard re-establishes them on the next run.
            seen.current.clear();
        };
    }, [channelRepository, chatRepository, isVerified, placeIds]);
};
