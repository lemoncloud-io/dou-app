import { useMemo } from 'react';

import type { DomainChannel } from '@chatic/data';

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
 * (`ChannelLocalDataSourceV2.getListKey` puts the sid in the key), so the cache layer could not
 * share the read between them — and the re-emit routing wakes both on any channel write
 * (`getAffectedListPrefixes` deliberately includes the cloud-wide `sid:|` prefix), so a single
 * channel write cost TWO full `loadAll` scans, one bridge round trip each on native. On the relay
 * cloud the two reads were not even different: `cacheReadList` skips sid scoping there, so the
 * per-site observer received the whole cloud and this hook filtered it in JS anyway — which is
 * exactly what it does now, minus the second observer.
 *
 * The filter stays because the cloud-wide read is not sid-isolated (see above), so rows from other
 * sites must not reach a per-site list.
 *
 * `isLoading` follows the shared observation's first answer rather than an emptiness test: a site
 * with no channels and a site whose read has not landed are indistinguishable from the array alone.
 */
export const useHomeChannels = (sid: string | null): HomeChannelsResult => {
    const { channels, isLoaded } = useActiveCloudData();

    const scoped = useMemo(() => (sid ? channels.filter(channel => channel.sid === sid) : []), [channels, sid]);

    return { channels: scoped, isLoading: !!sid && !isLoaded };
};
