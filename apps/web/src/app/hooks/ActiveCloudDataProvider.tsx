import { useMemo, type ReactNode } from 'react';

import { ActiveCloudDataContext, type ActiveCloudData } from './activeCloudDataContext';
import { useActiveCloudChannelsSource } from './useActiveCloudChannels';
import { useChannelUnreads } from './useChannelUnreads';
import { useMyJoins } from './useMyJoins';

/**
 * The single owner of the active cloud's channel + read-cursor observation (see
 * {@link ActiveCloudData} for what that replaces and why).
 *
 * Mounted once in `AppRuntime`, above both the badge runners and the router, so every surface reads
 * the same value. A cache write re-renders THIS component and its context consumers only: `children`
 * arrives as one unchanged element from `AppRuntime`, so React bails out of the router subtree
 * instead of walking it — which is strictly better than the previous arrangement, where the same
 * observation lived inside `UnifiedLayout` and every join write re-rendered the layout that wraps
 * every route.
 *
 * Observe-only (`sync: false`): mounting the app registers ZERO per-channel join sync. Freshness
 * rides `useBackgroundSync`'s cloud-wide `syncChannels` delta plus the join cache's own writes
 * (my reads land optimistically), and the screens that want a live cursor register it themselves
 * (`useJoinSyncRegistration`) so it tears down with them (ADR-0056).
 */
export const ActiveCloudDataProvider = ({ children }: { children: ReactNode }) => {
    const { channels, isLoaded } = useActiveCloudChannelsSource();
    const myJoins = useMyJoins(channels, { sync: false });
    const unreads = useChannelUnreads(channels, myJoins);

    const value = useMemo<ActiveCloudData>(
        () => ({ channels, isLoaded, myJoins, unreads }),
        [channels, isLoaded, myJoins, unreads]
    );

    return <ActiveCloudDataContext.Provider value={value}>{children}</ActiveCloudDataContext.Provider>;
};
