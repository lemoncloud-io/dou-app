import { useEffect, useRef } from 'react';

import type { DomainChannel, DomainChat } from '@chatic/data';
import { isNative, webClient } from '@chatic/bridges';
import { useWebCoreStore } from '@chatic/web-core';
import { useWebSocketV2Store } from '@chatic/socket';
import { useRepositories } from '@chatic/app-runtime';

import { usePlaces } from './usePlaces';
import { useNotificationPrefsStore, useReadCursorStore, useSelectedChannelStore } from '../stores';

const CHANNEL_LIMIT = 100;

const chatAuthorId = (chat: DomainChat): string | undefined => chat.owner$?.id ?? chat.ownerId;
const maxChatNo = (list: DomainChat[]): number => list.reduce((max, c) => Math.max(max, c.chatNo ?? 0), 0);
// The subscription list isn't guaranteed chronological, so the newest message is
// the one with the highest chatNo — not the last array element.
const newestChat = (list: DomainChat[]): DomainChat =>
    list.reduce((newest, c) => ((c.chatNo ?? 0) > (newest.chatNo ?? 0) ? c : newest));
const channelName = (channel: DomainChannel): string => channel.name ?? 'New message';

/** Suppress only when you're actively looking at that channel in a focused window. */
const isViewing = (channelId: string): boolean =>
    typeof document !== 'undefined' &&
    document.hasFocus() &&
    document.visibilityState === 'visible' &&
    useSelectedChannelStore.getState().selectedChannelId === channelId;

/**
 * Desktop-only OS notifications. The live WS streams every channel into the engine cache;
 * when a newer message from someone else arrives while the window is hidden, ask the shell
 * to show an OS notification. Covers channels across every place the user belongs to.
 * No-op outside the Desktop Shell (isNative() false) and swallows NATIVE_NOT_SUPPORTED so
 * plain-browser / older-shell runs degrade gracefully (ADR-0001).
 */
export const useDesktopNotifications = (): void => {
    const { channel: channelRepository, chat: chatRepository } = useRepositories();
    const { places } = usePlaces();
    const isVerified = useWebSocketV2Store(s => s.isVerified);
    const myId = useWebCoreStore(s => s.profile?.id);
    const myUid = useWebCoreStore(s => s.profile?.uid);
    const seen = useRef<Map<string, number>>(new Map());

    // Join the place ids into a stable dependency so the effect re-runs only when the set changes.
    const placeIds = places.map(p => p.id).join(',');

    useEffect(() => {
        if (!isNative() || !isVerified || places.length === 0) return;

        let active = true;
        const unsubs: Array<() => void> = [];

        const subscribeChannel = (placeId: string, channel: DomainChannel) => {
            unsubs.push(
                chatRepository.subscribeList(channel.id, result => {
                    const list = result?.list ?? [];
                    if (list.length === 0) return;

                    const top = maxChatNo(list);
                    const prev = seen.current.get(channel.id);
                    seen.current.set(channel.id, top);

                    // Skip the first snapshot (cache warm-up) — only notify on a real increase.
                    if (prev === undefined || top <= prev) return;
                    // Respect the user's notification preferences (global off / muted channel).
                    const prefs = useNotificationPrefsStore.getState();
                    if (!prefs.desktopEnabled || prefs.mutedChannels[channel.id]) return;
                    // Don't notify for a channel you're actively viewing (you can see it).
                    if (isViewing(channel.id)) return;
                    // Don't re-notify a message already marked read (e.g. resync redelivery).
                    if (top <= (useReadCursorStore.getState().cursors[channel.id] ?? 0)) return;

                    const latest = newestChat(list);
                    const authorId = chatAuthorId(latest);
                    if (authorId && (authorId === myId || authorId === myUid)) return;

                    void webClient
                        .request('ShowNotification', {
                            title: channelName(channel),
                            body: latest.content ?? '',
                            channelId: channel.id,
                            // Clicking the notification routes here (place + channel).
                            deeplink: `chatic-open:${encodeURIComponent(placeId)}|${encodeURIComponent(channel.id)}`,
                        })
                        .catch(() => undefined);
                })
            );
        };

        // Gather channels across all places (keeping each channel's place), then
        // subscribe to each channel's chat list.
        void Promise.all(
            places.map(place =>
                channelRepository
                    .fetchChannel({ sid: place.id, limit: CHANNEL_LIMIT }, { cachePolicy: 'cache-first' })
                    .then(result => (result.list ?? []).map(channel => ({ placeId: place.id, channel })))
                    .catch(() => [] as Array<{ placeId: string; channel: DomainChannel }>)
            )
        ).then(entries => {
            if (!active) return;

            const channelById = new Map<string, { placeId: string; channel: DomainChannel }>();
            for (const entry of entries.flat()) {
                if (entry.channel.id) channelById.set(entry.channel.id, entry);
            }

            // Prune seen-map entries for channels that no longer exist.
            for (const id of seen.current.keys()) {
                if (!channelById.has(id)) seen.current.delete(id);
            }

            channelById.forEach(({ placeId, channel }) => subscribeChannel(placeId, channel));
        });

        return () => {
            active = false;
            unsubs.forEach(fn => fn());
        };
        // placeIds captures the place set; places is read at run time.
         
    }, [channelRepository, chatRepository, isVerified, myId, myUid, placeIds]);
};
