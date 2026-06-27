import { useEffect, useMemo, useState } from 'react';

import { useRuntimeRepositories } from '@chatic/app-runtime';
import { useSessionIdentity } from '@chatic/web-core';
import type { DomainChannel, DomainJoin } from '@chatic/data';

import type { ChannelUnreads } from '../types';

/**
 * Derives per-channel unread counts from joins and channels.
 *
 * unread(channel) = max(0, latestChatNo - myJoin.readNo), where latestChatNo is the channel's
 * last chat number and readNo is the current user's read boundary (chatic model:
 * `max(0, channel.chatNo - join.readNo)`). Joins are observed once — the runtime keeps them
 * synced via the per-channel useJoinSync registrations in ChannelList.
 */
export const useChannelUnreads = (channels: DomainChannel[]): ChannelUnreads => {
    const { join } = useRuntimeRepositories();
    const { userId } = useSessionIdentity();

    const [joins, setJoins] = useState<DomainJoin[]>([]);

    useEffect(() => {
        return join.observeList({}, result => {
            setJoins(result?.list ?? []);
        });
    }, [join]);

    return useMemo(() => {
        // Read boundary per channel for the current user.
        const readNoByChannel = new Map<string, number>();
        for (const j of joins) {
            if (userId && j.userId !== userId) continue;
            readNoByChannel.set(j.channelId, j.readNo ?? 0);
        }

        const byChannel: Record<string, number> = {};
        let total = 0;
        for (const ch of channels) {
            const latestChatNo = ch.lastChat$?.chatNo ?? ch.chatNo ?? 0;
            const readNo = readNoByChannel.get(ch.id) ?? 0;
            const unread = Math.max(0, latestChatNo - readNo);
            byChannel[ch.id] = unread;
            total += unread;
        }
        return { byChannel, total };
    }, [channels, joins, userId]);
};
