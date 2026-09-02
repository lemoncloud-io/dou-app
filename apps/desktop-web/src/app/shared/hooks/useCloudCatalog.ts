import { useQuery } from '@tanstack/react-query';

import { cloudsKeys, useRuntimeRepositories, useSessionAuth } from '@chatic/app-runtime';

/**
 * The relay cloud catalog, as react-query. This app's own copy.
 *
 * Moved down from `@chatic/app-runtime`'s `data/hooks/cloud.ts`: react-query IS the cache for this
 * read (`ICloudRepositoryV2.fetchCloudCatalog` — "Never writes local cache … React-query owns this
 * read's cache", because the catalog mixes invited and owned clouds and would poison `cloudType`),
 * so the staleness policy is the whole policy and each app owns its own (ADR-0070 결정 5, ②안 방향).
 *
 * apps/web has a parallel copy. The duplication is the point: the shared thing is the repository
 * call and `cloudsKeys` (the runtime's `useLogin` invalidates that key after a relay login) — not
 * the cache policy, which this app is free to diverge on. `useClouds` in this folder is the rail's
 * composed view on top of this and is a different hook entirely.
 */
export const useCloudSessionCatalog = () => {
    const { isAuthenticated } = useSessionAuth();
    const { cloud } = useRuntimeRepositories();

    const {
        data,
        isError: isFetchError,
        isFetching,
        isPending,
        refetch,
    } = useQuery({
        queryKey: cloudsKeys.list({ limit: -1 }),
        queryFn: () => cloud.fetchCloudCatalog({ limit: -1 }),
        enabled: isAuthenticated,
        refetchOnWindowFocus: false,
        staleTime: 0,
        refetchOnMount: 'always',
    });

    return {
        clouds: data?.list ?? [],
        isCloudsError: !isFetching && !isPending && isFetchError,
        isFetchingClouds: isFetching,
        isPendingClouds: isPending,
        refetchClouds: refetch,
    };
};
