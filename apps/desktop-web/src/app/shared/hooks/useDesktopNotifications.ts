import { useEffect, useRef } from 'react';

import type { DomainChannel, DomainChat } from '@chatic/data';
import { isNative, webClient } from '@chatic/bridges';
import { useWebCoreStore } from '@chatic/web-core';
import { useWebSocketV2Store } from '@chatic/socket';
import { useRepositories } from '@chatic/app-runtime';

import { usePlaces } from './usePlaces';

const CHANNEL_LIMIT = 100;

const chatAuthorId = (chat: DomainChat): string | undefined => chat.owner$?.id ?? chat.ownerId;
const maxChatNo = (list: DomainChat[]): number => list.reduce((max, c) => Math.max(max, c.chatNo ?? 0), 0);
const channelName = (channel: DomainChannel): string => channel.name ?? 'New message';

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
    const seen = useRef<Map<string, number>>(new Map());

    // Join the place ids into a stable dependency so the effect re-runs only when the set changes.
    const placeIds = places.map(p => p.id).join(',');

    useEffect(() => {
        if (!isNative() || !isVerified || places.length === 0) return;

        let active = true;
        const unsubs: Array<() => void> = [];

        const subscribeChannel = (channel: DomainChannel) => {
            unsubs.push(
                chatRepository.subscribeList(channel.id, result => {
                    const list = result?.list ?? [];
                    if (list.length === 0) return;

                    const top = maxChatNo(list);
                    const prev = seen.current.get(channel.id);
                    seen.current.set(channel.id, top);

                    // Skip the first snapshot (cache warm-up) — only notify on a real increase.
                    if (prev === undefined || top <= prev) return;
                    if (document.visibilityState !== 'hidden') return;

                    const latest = list[list.length - 1];
                    if (myId && chatAuthorId(latest) === myId) return;

                    void webClient
                        .request('ShowNotification', {
                            title: channelName(channel),
                            body: latest.content ?? '',
                            channelId: channel.id,
                        })
                        .catch(() => undefined);
                })
            );
        };

        // Gather channels across all places, then subscribe to each channel's chat list.
        void Promise.all(
            places.map(place =>
                channelRepository
                    .fetchChannel({ sid: place.id, limit: CHANNEL_LIMIT }, { cachePolicy: 'cache-first' })
                    .then(result => result.list ?? [])
                    .catch(() => [] as DomainChannel[])
            )
        ).then(channelLists => {
            if (!active) return;

            const channelById = new Map<string, DomainChannel>();
            for (const channel of channelLists.flat()) {
                if (channel.id) channelById.set(channel.id, channel);
            }

            // Prune seen-map entries for channels that no longer exist.
            for (const id of seen.current.keys()) {
                if (!channelById.has(id)) seen.current.delete(id);
            }

            channelById.forEach(channel => subscribeChannel(channel));
        });

        return () => {
            active = false;
            unsubs.forEach(fn => fn());
        };
        // placeIds captures the place set; places is read at run time.
         
    }, [channelRepository, chatRepository, isVerified, myId, placeIds]);
};
