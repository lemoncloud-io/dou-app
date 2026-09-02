import { useQuery } from '@tanstack/react-query';

import { cloudsKeys, useRuntimeRepositories, useSessionAuth } from '@chatic/app-runtime';

/**
 * The relay cloud catalog, as react-query. This harness's own copy.
 *
 * Moved down from `@chatic/app-runtime`'s `data/hooks/cloud.ts` along with the copies in apps/web and
 * apps/desktop-web — react-query IS the cache for this read (`ICloudRepositoryV2.fetchCloudCatalog`
 * never writes the local cache), so the policy is the app's (ADR-0070 결정 5, ②안 방향). `cloudsKeys`
 * stays shared because the runtime's `useLogin` invalidates it after a relay login.
 */
export const useCloudSessionCatalog = () => {
    const { isAuthenticated } = useSessionAuth();
    const { cloud } = useRuntimeRepositories();

    const { data, isFetching, isPending, refetch } = useQuery({
        queryKey: cloudsKeys.list({ limit: -1 }),
        queryFn: () => cloud.fetchCloudCatalog({ limit: -1 }),
        enabled: isAuthenticated,
        refetchOnWindowFocus: false,
        staleTime: 0,
        refetchOnMount: 'always',
    });

    return {
        clouds: data?.list ?? [],
        isFetchingClouds: isFetching,
        isPendingClouds: isPending,
        refetchClouds: refetch,
    };
};
