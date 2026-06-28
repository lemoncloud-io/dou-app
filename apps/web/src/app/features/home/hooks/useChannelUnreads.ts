import { useEffect, useMemo, useState } from 'react';

import { useRuntimeRepositories } from '@chatic/app-runtime';
import { useSessionIdentity } from '@chatic/web-core';
import type { DomainChannel } from '@chatic/data';

import type { ChannelUnreads } from '../types';

/**
 * Derives per-channel unread counts for the current user.
 *
 * unread(channel) = max(0, latestChatNo - myReadNo), where latestChatNo is the channel's last
 * chat number (lastChat$.chatNo, falling back to channel.chatNo) and myReadNo is the current
 * user's read boundary from their join row. Join queries are channelId-scoped, so we observe
 * each channel's join list and pick our own row; the readNo stays live via the join syncs
 * registered in useMyJoinsSync. A channel with no join row yet has no read boundary, so it
 * shows no badge (left undefined, counted as 0) by design.
 */
export const useChannelUnreads = (channels: DomainChannel[]): ChannelUnreads => {
    const { join } = useRuntimeRepositories();
    const { userId } = useSessionIdentity();

    const [readNoByChannel, setReadNoByChannel] = useState<Record<string, number>>({});

    // Re-subscribe only when the set of channel ids changes, not on every new array identity.
    const channelKey = channels.map(c => c.id).join(',');

    useEffect(() => {
        if (!userId) return;
        const disposers = channels.map(ch =>
            join.observeList({ channelId: ch.id }, result => {
                const mine = (result?.list ?? []).find(j => j.userId === userId && j.channelId === ch.id);

                if (!mine) return;
                const readNo = mine.chatNo ?? 0;
                console.log('RAIME', mine, mine.readNo);

                setReadNoByChannel(prev => (prev[ch.id] === readNo ? prev : { ...prev, [ch.id]: readNo }));
            })
        );
        return () => disposers.forEach(dispose => dispose());
        // channelKey captures the channel id set; channels is read once per key.
    }, [join, userId, channelKey]);

    return useMemo(() => {
        const byChannel: Record<string, number> = {};
        let total = 0;
        for (const ch of channels) {
            const latestChatNo = ch.lastChat$?.chatNo ?? ch.chatNo ?? 0;
            const readNo = readNoByChannel[ch.id];

            const unread = readNo === undefined ? 0 : Math.max(0, latestChatNo - readNo);
            byChannel[ch.id] = unread;
            total += unread;
        }

        return { byChannel, total };
    }, [channels, readNoByChannel]);
};
