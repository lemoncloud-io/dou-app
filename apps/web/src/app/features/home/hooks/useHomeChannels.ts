import { useCallback, useEffect, useState } from 'react';

import { useRuntimeRepositories, useSocketState } from '@chatic/app-runtime';
import type { DomainChannel } from '@chatic/data';

export interface HomeChannelsResult {
    channels: DomainChannel[];
    isLoading: boolean;
    refresh: () => void;
}

/**
 * Observes the channel list for the active site. Mirrors the testbed ChatHomePage: the cache
 * read on the relay cloud is not sid-isolated, so results are filtered to the active site to
 * avoid flashing the previous site's channels mid-switch.
 */
export const useHomeChannels = (sid: string | null): HomeChannelsResult => {
    const { channel } = useRuntimeRepositories();
    const { isVerified } = useSocketState();

    const [channels, setChannels] = useState<DomainChannel[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (!sid) {
            setChannels([]);
            return;
        }
        setIsLoading(true);
        return channel.observeList({ sid }, result => {
            const list = (result?.list ?? []).filter(c => c.sid === sid);
            setChannels(list);
            setIsLoading(false);
        });
    }, [channel, sid]);

    // Verified-gated fetch so the channel list is not pulled against a stale session.
    useEffect(() => {
        if (!sid || !isVerified) return;
        void channel.refreshList({ sid }).catch(() => undefined);
    }, [channel, sid, isVerified]);

    const refresh = useCallback(() => {
        if (!sid) return;
        void channel.refreshList({ sid }).catch(() => undefined);
    }, [channel, sid]);

    return { channels, isLoading, refresh };
};
