import { useEffect, useRef, useState } from 'react';

import { useRuntimeRepositories, useSocketState } from '@chatic/app-runtime';
import { useSessionSelection } from '@chatic/web-core';
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
 * captured sid equals the active sid. selectedSiteId therefore drives re-subscription (covering both
 * site and cloud switches); isVerified is a backstop so it re-lands on the post-switch re-auth.
 */
export const useActiveCloudChannels = (): DomainChannel[] => {
    const { channel } = useRuntimeRepositories();
    const { selectedCloudId, selectedSiteId } = useSessionSelection();
    const { isVerified } = useSocketState();

    const [channels, setChannels] = useState<DomainChannel[]>([]);

    // Clear only when the cloud actually changes — the cloud-wide list is the same set across a
    // site switch, so clearing there would flash an empty list for no reason.
    const cloudRef = useRef(selectedCloudId);

    useEffect(() => {
        if (!channel) return;
        if (cloudRef.current !== selectedCloudId) {
            cloudRef.current = selectedCloudId;
            setChannels([]);
        }
        return channel.observeList({ sid: '' }, result => {
            setChannels(result?.list ?? []);
        });
    }, [channel, selectedCloudId, selectedSiteId, isVerified]);

    return channels;
};
