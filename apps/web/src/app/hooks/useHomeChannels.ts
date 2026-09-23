import { useMemo } from 'react';

import { isInPlaceList, type DomainChannel } from '@chatic/data';

import { useActiveCloudData } from './activeCloudDataContext';

export interface HomeChannelsResult {
    channels: DomainChannel[];
    isLoading: boolean;
}

/**
 * The channel list for one site — a slice of the app's single cloud-wide observation, NOT an
 * observer of its own.
 *
 * It used to open `channel.observeList({ sid })` while the badge surfaces observed
 * `channel.observeList({ sid: '' })`. Those two queries carry different observer keys
 * (`ChannelLocalDataSource.getListKey` puts the sid in the key), so the cache layer could not
 * share the read between them — and the re-emit routing wakes both on any channel write
 * (`getAffectedListPrefixes` deliberately includes the cloud-wide `sid:|` prefix), so a single
 * channel write cost TWO full `loadAll` scans, one bridge round trip each on native. On the relay
 * cloud the two reads were not even different: `cacheReadList` skips sid scoping there, so the
 * per-site observer received the whole cloud and this hook filtered it in JS anyway — which is
 * exactly what it does now, minus the second observer.
 *
 * The filter stays because the cloud-wide read is not sid-isolated (see above), so rows from other
 * sites must not reach a per-site list. It also drops the rooms that are not place-scoped at all —
 * cloud 1:1s, which carry a `sid` that describes where their creator stood rather than where the
 * conversation lives, and are read from their own cloud-wide section instead.
 *
 * `isLoading` follows the shared observation's `isLoaded` rather than an emptiness test: a site with
 * no channels and a site whose read has not landed are indistinguishable from the array alone. That
 * flag is deliberately not just "the observer fired" — an unvisited cloud's cache fires immediately
 * with nothing — so this stays loading until the empty list is actually explained.
 */
export const useHomeChannels = (sid: string | null): HomeChannelsResult => {
    const { channels, isLoaded } = useActiveCloudData();

    // `isInPlaceList`, not a bare `sid` comparison: a 1:1 is read cloud-wide and belongs to no
    // place's list, however its `sid` reads — see that rule for why the field cannot scope one.
    const scoped = useMemo(() => (sid ? channels.filter(channel => isInPlaceList(channel, sid)) : []), [channels, sid]);

    return { channels: scoped, isLoading: !!sid && !isLoaded };
};
