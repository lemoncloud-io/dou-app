import { useEffect, useRef } from 'react';

import type { DomainChannel } from '@chatic/runtime';
import { runtime } from '@chatic/runtime';

import { usePlaces } from './usePlaces';
import { lastChatNoOf } from '../utils/channelMerge';

export type ChannelLastChat = NonNullable<DomainChannel['lastChat$']>;

export interface ChannelChatFeed {
    placeId: string;
    channel: DomainChannel;
    chat: ChannelLastChat;
}

export const useChannelChatFeeds = (onChat: (feed: ChannelChatFeed) => void): void => {
    const { channel: channelRepository } = runtime.data.useRuntimeRepositories();
    const { places } = usePlaces();
    const { isVerified } = runtime.connection.useRuntimeSocketState();

    const seen = useRef<Map<string, number>>(new Map());
    const onChatRef = useRef(onChat);
    onChatRef.current = onChat;

    const placeIds = places.map(p => p.id).join(',');

    useEffect(() => {
        if (!isVerified || places.length === 0) return;
        let active = true;

        const subs = new Map<string, () => void>();
        const byPlace = new Map<string, Set<string>>();

        const emitChannel = (placeId: string, channel: DomainChannel) => {
            if (!channel.id) return;
            const last = channel.lastChat$;
            const top = lastChatNoOf(channel);
            if (top <= 0) return;
            const prev = seen.current.get(channel.id);
            if (prev === undefined || top > prev) seen.current.set(channel.id, top);
            if (prev === undefined || top <= prev || !last) return;
            onChatRef.current({ placeId, channel, chat: last });
        };

        const channelObservers = places.map(place => {
            return channelRepository.observeList({ sid: place.id }, result => {
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
                list.forEach(channel => {
                    if (channel.id && !subs.has(channel.id)) {
                        subs.set(channel.id, runtime.sync.registerSyncTarget({ type: 'channel', id: channel.id }));
                    }
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
            seen.current.clear();
        };
    }, [channelRepository, isVerified, placeIds]);
};
