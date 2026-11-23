import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Query } from '@tanstack/react-query';

import { runtime, type DomainCloud, type DomainListResult } from '@chatic/runtime';

import { useIsAccountGuest } from './useMyUser';

type Params = Record<string, unknown>;

const GUEST_CATALOG: DomainListResult<DomainCloud> = { list: [], meta: { total: 0, source: 'local' } };

export const useClouds = (params: Params = {}) => {
    const { isAuthenticated } = runtime.session.useSessionAuth();
    const isGuest = useIsAccountGuest();
    const { cloud } = runtime.data.useRuntimeRepositories();
    const listKey = runtime.data.cloudsKeys.list(params);

    return useQuery({
        queryKey: isGuest ? [...listKey, 'guest'] : listKey,
        queryFn: isGuest ? () => Promise.resolve(GUEST_CATALOG) : () => cloud.fetchCloudCatalog(params),
        enabled: isAuthenticated,
        refetchOnWindowFocus: false,
        staleTime: 0,
        refetchOnMount: 'always',
    });
};

export const useCloudSessionCatalog = () => {
    const { data, isError: isFetchError, isFetching, isPending, refetch } = useClouds({ limit: -1 });

    return {
        clouds: data?.list ?? [],
        hasCloudCatalog: data !== undefined,
        isCloudsError: !isFetching && !isPending && isFetchError,
        isFetchingClouds: isFetching,
        isPendingClouds: isPending,
        refetchClouds: refetch,
    };
};

const lastReadFailed = (query: Query): boolean => query.state.errorUpdatedAt > query.state.dataUpdatedAt;

export const useCloudCatalogRelayResync = (): void => {
    const queryClient = useQueryClient();
    const isRelayVerified = runtime.connection.useSlotVerified(runtime.connection.RELAY_SLOT);
    const subscribe = useCallback(
        (listener: () => void) => queryClient.getQueryCache().subscribe(listener),
        [queryClient]
    );
    const hasFailedRead = useSyncExternalStore(subscribe, () =>
        queryClient
            .getQueryCache()
            .findAll({ queryKey: runtime.data.cloudsKeys.all, type: 'active' })
            .some(lastReadFailed)
    );

    useEffect(() => {
        if (!isRelayVerified || !hasFailedRead) return;
        void queryClient.refetchQueries(
            { queryKey: runtime.data.cloudsKeys.all, type: 'active', predicate: lastReadFailed },
            { cancelRefetch: false }
        );
    }, [isRelayVerified, hasFailedRead, queryClient]);
};
