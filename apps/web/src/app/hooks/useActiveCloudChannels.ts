import { useEffect, useMemo, useRef, useState } from 'react';

import { useRuntimeRepositories } from '@chatic/app-runtime';
import { useGlobalSession, useSessionSelection } from '@chatic/web-core';
import type { DomainChannel } from '@chatic/data';

import { useAccessiblePlaceIds } from './useAccessiblePlaceIds';

/**
 * Observes the active cloud's channel list across every site, not just the selected one, and drops
 * the ones the user can no longer reach.
 *
 * That last part is the whole reason unread counts could get stuck. A channel whose place has left
 * the rail — access revoked, place deleted — keeps its cached row and its unread, and it shows up in
 * exactly one of the three outputs derived from this list: not in the channel list (home renders the
 * active site only) and not as a place dot (a place absent from the rail has nowhere to draw one),
 * but yes in `total`, which is the app-icon badge. Nothing on screen said anything was unread and
 * the badge would not go down, because there was no way to open the room and read it.
 *
 * Filtering waits for the place list to resolve: an unresolved list is "don't know yet", never "no
 * places", or the badge would blink to zero on every cloud switch. A channel with no `sid` at all is
 * kept — that is a row mid-sync, not an orphan.
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
    const accessiblePlaceIds = useAccessiblePlaceIds();
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

    return useMemo(() => {
        if (!accessiblePlaceIds) return channels;
        return channels.filter(row => !row.sid || accessiblePlaceIds.has(row.sid));
    }, [channels, accessiblePlaceIds]);
};
