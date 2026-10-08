import { useEffect, useState } from 'react';

import { useQuery } from '@tanstack/react-query';

import { runtime } from '@chatic/app-runtime';

/**
 * The relay cloud catalog, as react-query. This app's own copy.
 *
 * Moved down from `@chatic/app-runtime`'s `data/hooks/cloud.ts`: react-query IS the cache for this
 * read (`ICloudRepository.fetchCloudCatalog` — "Never writes local cache … React-query owns this
 * read's cache", because the catalog mixes invited and owned clouds and would poison `cloudType`),
 * so the staleness policy is the whole policy and each app owns its own (ADR-0070 decision 5, option ② direction).
 *
 * apps/web has a parallel copy. The duplication is the point: the shared thing is the repository
 * call and `runtime.data.cloudsKeys` (the runtime's `useLogin` invalidates that key after a relay login) — not
 * the cache policy, which this app is free to diverge on. `useClouds` in this folder is the rail's
 * composed view on top of this and is a different hook entirely.
 */
export const useCloudSessionCatalog = () => {
    const { isAuthenticated } = runtime.session.useSessionAuth();
    const { cloud } = runtime.data.useRuntimeRepositories();

    const {
        data,
        isError: isFetchError,
        isFetching,
        isPending,
        refetch,
    } = useQuery({
        queryKey: runtime.data.cloudsKeys.list({ limit: -1 }),
        queryFn: () => cloud.fetchCloudCatalog({ limit: -1 }),
        enabled: isAuthenticated,
        refetchOnWindowFocus: false,
        staleTime: 0,
        refetchOnMount: 'always',
    });

    // The outcome of the last read that settled. A retry in flight keeps it, so a failure stays on
    // screen while it is retried instead of dropping out and coming back.
    const [lastReadFailed, setLastReadFailed] = useState(false);
    useEffect(() => {
        if (!isFetching) setLastReadFailed(isFetchError);
    }, [isFetching, isFetchError]);

    // The read goes out as soon as a stored session exists, which can be before the relay socket has
    // verified. A signing credential that lapsed while the app was closed or asleep is renewed only
    // through that socket, so such a read fails on a session that is healthy seconds later — and
    // nothing else reads the catalog again. Both values are in the deps so a read that was still in
    // flight when the socket verified is covered too. The re-read failing changes neither, so a
    // failure gets one re-read per relay verification and the reload tile after that, never a loop.
    // (A component that mounts while the failure stands adds one more: its own copy of this state
    // starts clean, so its mount read failing is a new failure to it.)
    // Several components mount this hook and each runs this effect; `cancelRefetch: false` makes
    // the later ones join the read already in flight instead of restarting it.
    const isRelayVerified = runtime.connection.useSlotVerified(runtime.connection.RELAY_SLOT);
    useEffect(() => {
        if (isAuthenticated && isRelayVerified && lastReadFailed) void refetch({ cancelRefetch: false });
    }, [isAuthenticated, isRelayVerified, lastReadFailed, refetch]);

    return {
        clouds: data?.list ?? [],
        isCloudsError: lastReadFailed,
        isFetchingClouds: isFetching,
        isPendingClouds: isPending,
        refetchClouds: refetch,
    };
};
