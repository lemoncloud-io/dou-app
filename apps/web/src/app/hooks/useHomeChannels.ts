import { useEffect, useState } from 'react';

import { useRuntimeRepositories } from '@chatic/app-runtime';
import { useGlobalSession } from '@chatic/web-core';
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
 *
 * uid is part of the cache observer scope key ({cid, uid}) and flips at cloud-switch commit, which
 * can lag the sid change (a cross-cloud switch may reuse a numerically equal sid). Re-keying on uid
 * too keeps the observer aligned with the scope the post-commit fetch reemits against.
 *
 * SCOPE PINNING — the {cid, uid} override keys the observer off the React session, not the live
 * DataContextProvider whose ancestor commits the new cloud AFTER this hook subscribes; without it a
 * cloud switch registers the observer under the stale provider cid and misses the post-commit write
 * (needs a manual refresh). The channel scope drops sid, so the per-site view stays isolated by the
 * query `sid` (the list-key suffix), not the scope key. See PlaceLocalDataSourceV2 reemit tests.
 */
export const useHomeChannels = (sid: string | null): HomeChannelsResult => {
    const { channel } = useRuntimeRepositories();
    const session = useGlobalSession();
    const uid = session.identity.userId ?? undefined;
    const cid = session.cloud?.cloudId && session.cloud.cloudId !== 'default' ? session.cloud.cloudId : 'default';

    const [channels, setChannels] = useState<DomainChannel[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (!sid) {
            setChannels([]);
            return;
        }
        setIsLoading(true);
        return channel.observeList(
            { sid },
            result => {
                const list = (result?.list ?? []).filter(c => c.sid === sid);
                setChannels(list);
                setIsLoading(false);
            },
            { cid, uid }
        );
    }, [channel, sid, cid, uid]);

    return { channels, isLoading };
};
