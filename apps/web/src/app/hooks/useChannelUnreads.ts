import { useMemo } from 'react';

import { isCloudDm, type DomainChannel, type DomainJoin } from '@chatic/runtime-react';

import { unreadOf } from '../utils/countUnread';

export interface ChannelUnreads {
    byChannel: Record<string, number>;
    byPlace: Record<string, number>;
    total: number;
}

export const useChannelUnreads = (
    channels: DomainChannel[],
    joinByChannel?: Map<string, DomainJoin>
): ChannelUnreads => {
    return useMemo(() => {
        const byChannel: Record<string, number> = {};
        const byPlace: Record<string, number> = {};
        let total = 0;
        for (const ch of channels) {
            const unread = unreadOf(ch, joinByChannel?.get(ch.id));

            byChannel[ch.id] = unread;
            if ((!ch.sid || ch.sid === '#') && isCloudDm(ch)) continue;
            total += unread;
            if (ch.sid) {
                byPlace[ch.sid] = (byPlace[ch.sid] ?? 0) + unread;
            }
        }

        return { byChannel, byPlace, total };
    }, [channels, joinByChannel]);
};
