import { useEffect, useRef, useState } from 'react';

import { useRuntimeRepositories } from '@chatic/app-runtime';
import { useGlobalSession, useSessionSelection } from '@chatic/web-core';
import type { DomainChannel } from '@chatic/data';

/**
 * Observes the active cloud's FULL channel list — every site, not just the selected one.
 *
 * An empty `sid` takes the unfiltered branch of the channel cache read, so this returns all
 * channels for the active cloud (each still tagged with its own sid). It's the single source the
 * home unread aggregation derives the per-place / cloud totals from. Cache observe only — no
 * per-channel realtime registration; freshness rides useBackgroundSync's periodic cloud-wide
 * `syncChannels` delta (ChannelView carries `$join`/`lastChat$`/`metaNo` inline).
 *
 * Re-subscribe timing: the cache reemits by a key hashed over the full {cid, sid, uid} context and
 * channel writes run under the active sid, so an observer keeps matching writes only while its
 * captured {cid, sid, uid} equals the active one. selectedCloudId/selectedSiteId cover site and
 * cloud switches; uid is the third scope component and flips at cloud-switch commit (after the
 * optimistic cid pre-apply), so it must drive re-subscription too — otherwise the observer stays
 * registered under the pre-commit uid and misses the post-commit fetch reemit.
 */
export const useActiveCloudChannels = (): DomainChannel[] => {
    const { channel } = useRuntimeRepositories();
    const { selectedCloudId, selectedSiteId } = useSessionSelection();
    const uid = useGlobalSession().identity.userId ?? undefined;

    const [channels, setChannels] = useState<DomainChannel[]>([]);

    // Clear only when the cloud/uid actually changes — the cloud-wide list is the same set across a
    // site switch, so clearing there would flash an empty list for no reason.
    const scopeRef = useRef(`${selectedCloudId}|${uid ?? ''}`);

    useEffect(() => {
        if (!channel) return;
        const scope = `${selectedCloudId}|${uid ?? ''}`;
        if (scopeRef.current !== scope) {
            scopeRef.current = scope;
            setChannels([]);
        }
        return channel.observeList({ sid: '' }, result => {
            setChannels(result?.list ?? []);
        });
    }, [channel, selectedCloudId, selectedSiteId, uid]);

    return channels;
};
