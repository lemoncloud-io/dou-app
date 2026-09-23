import { useMemo } from 'react';

import { runtime } from '@chatic/app-runtime';
import type { DomainChannel } from '@chatic/data';

import { useActiveCloudData } from '../../../hooks';

export interface UseCloudDmCandidatesResult {
    /** User ids a 1:1 can be opened with, in no particular order. */
    candidateIds: string[];
    isLoading: boolean;
}

/**
 * People I can open a cloud 1:1 with: everyone who shares at least one room with me anywhere in
 * this cloud, minus myself.
 *
 * **This is not "every member of the cloud", and it cannot be.** The server has no user directory —
 * every listing action is scoped to a single channel — so the pool has to be assembled on the
 * client out of rooms I am already in. Somebody in this cloud who shares no room with me is not
 * reachable here, and the screen has to read as what this is rather than promising a directory.
 *
 * The same derivation `useInviteCandidates` does, widened from one place to the whole cloud. A
 * cloud 1:1 belongs to no place, so scoping the pool to one would hide exactly the colleague in
 * another place that this feature exists to reach. Like that hook it issues NO requests: the cloud
 * observation is already open for the home list and every row carries its roster.
 *
 * **People I already have a 1:1 with are left in.** The server resolves a pair to one room, so
 * picking them re-opens the existing conversation rather than making a second one — filtering them
 * out would remove a working path to a room and leave the reader wondering where it went.
 */
export const useCloudDmCandidates = (): UseCloudDmCandidatesResult => {
    const { userId } = runtime.session.useSessionIdentity();
    const { channels, isLoaded } = useActiveCloudData();

    const candidateIds = useMemo(() => {
        const pool = new Set<string>();
        channels.forEach((channel: DomainChannel) => {
            // A row that arrived without its roster contributes nothing rather than guessing; the
            // field is optional and only the `detail: true` reads fill it.
            channel.memberIds?.forEach(memberId => {
                if (memberId && memberId !== userId) pool.add(memberId);
            });
        });
        return Array.from(pool);
    }, [channels, userId]);

    // Follows the shared observation rather than an emptiness test: a cloud where I share no room
    // with anybody and a cloud whose read has not landed look identical from the array alone.
    return { candidateIds, isLoading: !isLoaded };
};
