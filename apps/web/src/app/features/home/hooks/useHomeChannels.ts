import { useEffect, useState } from 'react';

import { useRuntimeRepositories } from '@chatic/app-runtime';
import type { DomainChannel } from '@chatic/data';

export interface HomeChannelsResult {
    channels: DomainChannel[];
    isLoading: boolean;
}

/**
 * Observes the channel list for the active site and is the source for the displayed channel list
 * + its number badges. Keyed on sid so it re-subscribes on a site switch — the cache reemits by a
 * key hashed over {cid, sid, uid}, so the observer must re-key on the active sid to keep matching
 * the realtime channel writes (which run under the active sid context).
 *
 * List discovery (fetch) is owned globally by useBackgroundSync, and per-channel realtime sync is
 * registered by the rendered ChannelItem (useChannelSync) — so this hook only subscribes to cache.
 * The cache read on the relay cloud is not sid-isolated, so results are filtered to the active
 * site to avoid flashing the previous site's channels mid-switch.
 */
export const useHomeChannels = (sid: string | null): HomeChannelsResult => {
    const { channel } = useRuntimeRepositories();

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

    return { channels, isLoading };
};
