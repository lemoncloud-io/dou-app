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
 * Re-subscribe timing: the channel cache is cloud-wide and its observer scope keys by {cid, uid}
 * (sid dropped — see ChannelLocalDataSourceV2.getScopeKey), so an observer keeps matching writes
 * while its captured {cid, uid} equals the active one. Only cloud (cid) and uid switches change that
 * scope — a site switch does NOT, since the cloud-wide read (`{sid: ''}`) returns the same set for
 * every site — so this observer is not keyed on the active sid at all.
 *
 * SCOPE PINNING — the {cid, uid} override keys the observer off the React session directly instead of
 * the live DataContextProvider, whose ancestor (RuntimeDataBinder) commits the new cloud AFTER this
 * descendant hook subscribes. Without it, a cloud switch registers the observer under the stale
 * provider cid and the post-commit write reemit never reaches it (needs a manual refresh). See
 * PlaceLocalDataSourceV2 reemit-routing tests.
 */
export const useActiveCloudChannels = (): DomainChannel[] => {
    const { channel } = useRuntimeRepositories();
    const { selectedCloudId } = useSessionSelection();
    const uid = useGlobalSession().identity.userId ?? undefined;
    const cid = selectedCloudId ?? 'default';

    const [channels, setChannels] = useState<DomainChannel[]>([]);

    // Clear only when the cloud/uid actually changes — the cloud-wide list is the same set across a
    // site switch, so clearing there would flash an empty list for no reason.
    const scopeRef = useRef(`${cid}|${uid ?? ''}`);

    useEffect(() => {
        if (!channel) return;
        const scope = `${cid}|${uid ?? ''}`;
        if (scopeRef.current !== scope) {
            scopeRef.current = scope;
            setChannels([]);
        }
        return channel.observeList(
            { sid: '' },
            result => {
                setChannels(result?.list ?? []);
            },
            { cid, uid }
        );
    }, [channel, cid, uid]);

    return channels;
};
