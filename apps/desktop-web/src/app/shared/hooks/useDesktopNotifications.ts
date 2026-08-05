import { useEffect, useRef } from 'react';

import type { DomainChannel, DomainJoin } from '@chatic/data';
import { isNative, webClient } from '@chatic/bridges';
import { useRuntimeRepositories, useSocketState } from '@chatic/app-runtime';
import { useSessionIdentity } from '@chatic/web-core';

import { usePlaces } from './usePlaces';
import { useChannelChatFeeds, type ChannelChatFeed, type ChannelLastChat } from './useChannelChatFeeds';
import { isDndActive, isMentioned, isNotifiableChat, resolveMyMentionNames, stripMarkdown } from '../utils';
import { channelNotifyMode, useNotificationPrefsStore, useReadCursorStore, useSelectedChannelStore } from '../stores';

// DMs have no channel name — title with the sender instead. Named channels read as
// `#name`, matching the cross-cloud push banner.
const notificationTitle = (channel: DomainChannel, latest: ChannelLastChat): string =>
    channel.name ? `#${channel.name}` : (latest.owner$?.name ?? 'New message');

/** Suppress only when you're actively looking at that channel in a focused window. */
const isViewing = (channelId: string): boolean =>
    typeof document !== 'undefined' &&
    document.hasFocus() &&
    document.visibilityState === 'visible' &&
    useSelectedChannelStore.getState().selectedChannelId === channelId;

/**
 * Desktop-only OS notifications. The shared chat-feed engine (useChannelChatFeeds) streams every
 * registered channel's genuinely-new messages here; when a newer message from someone else
 * arrives while the window is hidden, ask the shell to show an OS notification. Covers channels
 * across every place the user belongs to. No-op outside the Desktop Shell (isNative() false) and
 * swallows NATIVE_NOT_SUPPORTED so plain-browser / older-shell runs degrade gracefully (ADR-0001).
 *
 * The per-channel notify mode is reverse-synced separately (`join.observeList`): another device
 * changing join.notify lands here as a join cache update — mirrored into the local prefs (which
 * win at notify time) so devices don't drift.
 */
export const useDesktopNotifications = (): void => {
    const { channel: channelRepository, join: joinRepository } = useRuntimeRepositories();
    const { places } = usePlaces();
    const { isVerified } = useSocketState();
    const { userId: myUid } = useSessionIdentity();

    // Read identity at notify/mirror time via a ref so a changing profile doesn't re-run the
    // join effect (which would drop every live join subscription).
    const myUidRef = useRef(myUid);
    myUidRef.current = myUid;

    // OS-notification policy on each channel's genuinely-new messages. The shared hook already
    // dropped optimistic own sentinels and skipped the cache warm-up baseline, so `chats` are
    // persisted messages strictly above the previous high-water mark.
    useChannelChatFeeds(({ placeId, channel, chat }: ChannelChatFeed) => {
        // No-op outside the Desktop Shell — the renderer must never raise an OS banner in a
        // plain browser (webClient would NATIVE_NOT_SUPPORTED anyway; skip the round-trip).
        if (!isNative()) return;

        // The channel watermark gives us the latest message (chat content streams only for the
        // focused room in v2, so background notifications ride the channel record instead).
        const top = chat.chatNo ?? 0;
        // Join/leave (and, later, reactions) arrive here as ordinary feed rows with no
        // readable body — banner them and the reader gets an empty notification.
        if (!isNotifiableChat(chat)) return;
        // Respect the user's notification preferences (global off / channel mode).
        const prefs = useNotificationPrefsStore.getState();
        // Global do-not-disturb (snooze / quiet hours) silences every banner.
        if (isDndActive(prefs)) return;
        const notifyMode = channelNotifyMode(prefs, channel.id);
        if (!prefs.desktopEnabled || notifyMode === 'none') return;
        // Don't notify for a channel you're actively viewing (you can see it).
        if (isViewing(channel.id)) return;
        // Don't re-notify a message already marked read (e.g. resync redelivery).
        const cursor = useReadCursorStore.getState().cursors[channel.id] ?? 0;
        if (top <= cursor) return;

        // ownerId is the author's global uid (same space as profile.uid). Don't notify my own.
        if (chat.ownerId && chat.ownerId === myUidRef.current) return;

        // Mentions-only channels: drop anything that doesn't @-mention me
        // (global profile name + this place's nick, plus @channel/@here).
        if (notifyMode === 'mention' && !isMentioned(chat.content ?? '', resolveMyMentionNames())) return;

        // Named channel → prefix the sender so it's visible ("sender: message"); a DM's
        // title already is the sender, so don't repeat it. Matches the cross-cloud banner.
        const sender = chat.owner$?.name;
        const message = stripMarkdown(chat.content ?? '');
        void webClient
            .request({
                type: 'ShowNotification',
                data: {
                    title: notificationTitle(channel, chat),
                    body: channel.name && sender ? `${sender}: ${message}` : message,
                    channelId: channel.id,
                    // Clicking the notification routes here (place + channel).
                    deeplink: `chatic-open:${encodeURIComponent(placeId)}|${encodeURIComponent(channel.id)}`,
                },
            })
            // Degrade gracefully on older shells (NATIVE_NOT_SUPPORTED) or transient bridge
            // errors — a dropped OS banner must never break the renderer.
            .catch(() => undefined);
    });

    // Join the place ids into a stable dependency so the effect re-runs only when the set changes.
    const placeIds = places.map(p => p.id).join(',');

    // Reverse-sync the per-channel notify mode. Native-only (mirrors the old setup gate): another
    // device changing join.notify lands as a join cache update — mirror it into the local prefs
    // (which win at notify time). Guarded on change: read receipts remap to join updates
    // constantly. The shared chat-feed hook already registers each channel's sync target (which
    // streams these join updates into the cache), so this only needs to observe the join cache.
    useEffect(() => {
        if (!isNative() || !isVerified || places.length === 0) return;
        let active = true;

        // channelId → join observe teardown.
        const subs = new Map<string, () => void>();
        const byPlace = new Map<string, Set<string>>();

        const mirrorJoinNotify = (list: DomainJoin[]) => {
            const uid = myUidRef.current;
            const mine = uid ? list.find(j => j.userId === uid) : undefined;
            const notify = mine?.notify;
            if (!mine?.channelId || (notify !== 'all' && notify !== 'mention' && notify !== 'none')) return;
            const prefs = useNotificationPrefsStore.getState();
            if (prefs.channelNotify[mine.channelId] !== notify) prefs.setChannelNotify(mine.channelId, notify);
        };

        const ensureJoinSub = (channel: DomainChannel) => {
            if (!channel.id || subs.has(channel.id)) return;
            const channelId = channel.id;
            const unsubJoin = joinRepository.observeList({ channelId }, result => mirrorJoinNotify(result?.list ?? []));
            subs.set(channelId, unsubJoin);
        };

        const channelObservers = places.map(place =>
            channelRepository.observeList({ sid: place.id }, result => {
                if (!active) return;
                const list = ((result?.list ?? []) as DomainChannel[]).filter(c => c.sid === place.id);
                const nextIds = new Set(list.map(c => c.id).filter((id): id is string => !!id));
                const prevIds = byPlace.get(place.id) ?? new Set<string>();
                for (const id of prevIds) {
                    if (!nextIds.has(id)) {
                        subs.get(id)?.();
                        subs.delete(id);
                    }
                }
                list.forEach(ensureJoinSub);
                byPlace.set(place.id, nextIds);
            })
        );

        return () => {
            active = false;
            channelObservers.forEach(unsub => unsub());
            subs.forEach(fn => fn());
            subs.clear();
            byPlace.clear();
        };
    }, [channelRepository, joinRepository, isVerified, placeIds]);
};
