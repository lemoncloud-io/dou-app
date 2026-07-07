import { useEffect, useRef } from 'react';

import type { DomainChannel } from '@chatic/data';
import { getSyncManager, useRuntimeRepositories, useSocketState } from '@chatic/app-runtime';

import { usePlaces } from './usePlaces';
import { lastChatNoOf } from '../utils/channelMerge';

/** A channel's newest message (its live `lastChat$`), when its watermark just advanced. */
export type ChannelLastChat = NonNullable<DomainChannel['lastChat$']>;

export interface ChannelChatFeed {
    placeId: string;
    channel: DomainChannel;
    /** The channel's latest message, taken from the live channel record. */
    chat: ChannelLastChat;
}

/**
 * Shared per-channel feed for desktop background features (OS notifications + the @-mention
 * inbox), driven by the CHANNEL watermark.
 *
 * v2 streams chat *content* only for the one focused room (`registerChat`), so background
 * channels' chat cache is never fed by live messages — a chat-message feed would never fire for
 * them. But each channel's *record* (`lastChat$` / `chatNo`) is kept live by a per-channel
 * `registerChannel` sync target, which also feeds the unread badges. So we detect "a new message
 * arrived in channel X" as that channel's `lastChat$` advancing, and hand the consumer that last
 * message. Limitation vs the v1 global chat stream: only the channel's *latest* message is seen
 * (rapid bursts collapse to the newest), which is exactly what an OS banner needs.
 *
 * Browser-safe: no native gate. Callers add their own gates (DND, mute, native-shell, isViewing,
 * own-message, mention filtering) inside the callback.
 */
export const useChannelChatFeeds = (onChat: (feed: ChannelChatFeed) => void): void => {
    const { channel: channelRepository } = useRuntimeRepositories();
    const { places } = usePlaces();
    const { isVerified } = useSocketState();

    // Per-channel high-water mark of the newest chatNo already emitted.
    const seen = useRef<Map<string, number>>(new Map());
    // Read the callback at emit time via a ref so an unstable callback identity doesn't re-run
    // the effect (which would drop every live subscription).
    const onChatRef = useRef(onChat);
    onChatRef.current = onChat;

    // Join the place ids into a stable dependency so the effect re-runs only when the set changes.
    const placeIds = places.map(p => p.id).join(',');

    useEffect(() => {
        if (!isVerified || places.length === 0) return;
        let active = true;
        const sync = getSyncManager();

        // channelId → unregister its channel sync target.
        const subs = new Map<string, () => void>();
        // placeId → channel ids currently tracked for that place (to detect removals).
        const byPlace = new Map<string, Set<string>>();

        const emitChannel = (placeId: string, channel: DomainChannel) => {
            if (!channel.id) return;
            const last = channel.lastChat$;
            const top = lastChatNoOf(channel);
            if (top <= 0) return;
            const prev = seen.current.get(channel.id);
            // Monotonic baseline: never regress on a partial/stale emit.
            if (prev === undefined || top > prev) seen.current.set(channel.id, top);
            // Skip the first (warm-up) snapshot and any non-advancing emit; need a message object.
            if (prev === undefined || top <= prev || !last) return;
            onChatRef.current({ placeId, channel, chat: last });
        };

        // Observe each place's channel list; register a channel sync target per channel (keeps its
        // lastChat$ live), reconcile on the channel set changing, and emit on a watermark advance.
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
                list.forEach(channel => {
                    if (channel.id && !subs.has(channel.id)) subs.set(channel.id, sync.registerChannel(channel.id));
                    emitChannel(place.id, channel);
                });
                byPlace.set(place.id, nextIds);
            });
        });

        return () => {
            active = false;
            channelObservers.forEach(unsub => unsub());
            subs.forEach(fn => fn());
            subs.clear();
            byPlace.clear();
            // Channel ids are per-cloud sequential and collide across clouds; drop baselines with
            // the subs so the first-snapshot guard re-establishes them on the next run.
            seen.current.clear();
        };
    }, [channelRepository, isVerified, placeIds]);
};
