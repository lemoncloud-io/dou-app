import { useQuery } from '@tanstack/react-query';

import { cloudsKeys, useRuntimeRepositories, useSessionAuth } from '@chatic/app-runtime';

import type { Params } from '@lemoncloud/lemon-web-core';

/**
 * The relay cloud catalog, as react-query.
 *
 * Moved down from `@chatic/app-runtime`'s `data/hooks/cloud.ts`: react-query IS the cache for this
 * read, which `ICloudRepositoryV2.fetchCloudCatalog` states in its own docblock ("Never writes local
 * cache … React-query owns this read's cache") — the catalog mixes invited and owned clouds and
 * would poison `cloudType` classification if it landed in the local cache. The staleness policy
 * below is therefore the whole policy, and it belongs to the app that renders it.
 *
 * `cloudsKeys` still comes from the runtime on purpose: `useLogin` invalidates the catalog right
 * after a relay login, so that key is shared vocabulary between the lib and the apps.
 */
export type UseCloudsParams = Params & {
    enabled?: boolean;
};

export type UseCloudsOptions = {
    enabled?: boolean;
};

export const useClouds = (params: UseCloudsParams = {}, options?: UseCloudsOptions) => {
    const { isAuthenticated } = useSessionAuth();
    const { cloud } = useRuntimeRepositories();
    const { enabled: legacyEnabled, ...requestParams } = params;
    const enabled = options?.enabled ?? legacyEnabled ?? true;

    return useQuery({
        queryKey: cloudsKeys.list(requestParams),
        queryFn: () => cloud.fetchCloudCatalog(requestParams),
        enabled: isAuthenticated && enabled,
        refetchOnWindowFocus: false,
        staleTime: 0,
        refetchOnMount: 'always',
    });
};

/**
 * Fetches the relay-visible cloud catalog for authenticated users.
 */
export const useCloudSessionCatalog = () => {
    const { isAuthenticated } = useSessionAuth();
    const {
        data,
        isError: isFetchError,
        isFetching,
        isPending,
        refetch,
    } = useClouds({ limit: -1, enabled: isAuthenticated });

    return {
        clouds: data?.list ?? [],
        isCloudsError: !isFetching && !isPending && isFetchError,
        isFetchingClouds: isFetching,
        isPendingClouds: isPending,
        refetchClouds: refetch,
    };
};
