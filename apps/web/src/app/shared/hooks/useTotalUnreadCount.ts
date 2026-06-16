import { useEffect, useMemo, useState } from 'react';

import type { DomainChannel, DomainListResult } from '@chatic/data';
import { useRepositories } from '../data';
import { useSocketState } from '../socket';

export const useTotalUnreadCount = () => {
    const sid = useSocketState(state => state.selectedPlaceId) || 'default';
    const { channel: channelRepository } = useRepositories();

    const [channels, setChannels] = useState<DomainChannel[]>([]);

    useEffect(() => {
        if (!sid) {
            setChannels([]);
            return;
        }

        const unsubscribe = channelRepository.subscribeList(
            { sid, detail: true },
            (result: DomainListResult<DomainChannel> | null) => {
                setChannels(result?.list || []);
            }
        );

        return () => {
            unsubscribe();
        };
    }, [channelRepository, sid]);

    return useMemo(() => {
        return channels.reduce((sum: number, ch) => sum + ((ch.unreadCount as number) ?? 0), 0);
    }, [channels]);
};
