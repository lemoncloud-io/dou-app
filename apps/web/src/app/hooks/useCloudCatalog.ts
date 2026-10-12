import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Query } from '@tanstack/react-query';

import { runtime } from '@chatic/app-runtime';

import type { Params } from '@lemoncloud/lemon-web-core';

/**
 * The relay cloud catalog, as react-query.
 *
 * Moved down from `@chatic/app-runtime`'s `data/hooks/cloud.ts`: react-query IS the cache for this
 * read, which `ICloudRepository.fetchCloudCatalog` states in its own docblock ("Never writes local
 * cache … React-query owns this read's cache") — the catalog mixes invited and owned clouds and
 * would poison `cloudType` classification if it landed in the local cache. The staleness policy
 * below is therefore the whole policy, and it belongs to the app that renders it.
 *
 * `runtime.data.cloudsKeys` still comes from the runtime on purpose: `useLogin` invalidates the catalog right
 * after a relay login, so that key is shared vocabulary between the lib and the apps.
 */
export type UseCloudsParams = Params & {
    enabled?: boolean;
};

export type UseCloudsOptions = {
    enabled?: boolean;
};

export const useClouds = (params: UseCloudsParams = {}, options?: UseCloudsOptions) => {
    const { isAuthenticated } = runtime.session.useSessionAuth();
    const { cloud } = runtime.data.useRuntimeRepositories();
    const { enabled: legacyEnabled, ...requestParams } = params;
    const enabled = options?.enabled ?? legacyEnabled ?? true;

    return useQuery({
        queryKey: runtime.data.cloudsKeys.list(requestParams),
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
    const { isAuthenticated } = runtime.session.useSessionAuth();
    const {
        data,
        isError: isFetchError,
        isFetching,
        isPending,
        refetch,
    } = useClouds({ limit: -1, enabled: isAuthenticated });

    return {
        clouds: data?.list ?? [],
        // The catalog has answered at least once. Distinct from `!isPendingClouds`: a first fetch
        // that failed is no longer pending, yet `clouds` is still an empty stand-in, not an answer.
        hasCloudCatalog: data !== undefined,
        isCloudsError: !isFetching && !isPending && isFetchError,
        isFetchingClouds: isFetching,
        isPendingClouds: isPending,
        refetchClouds: refetch,
    };
};

/** The last read of this query that settled was a failure — and it stays so while a re-read runs. */
const lastReadFailed = (query: Query): boolean => query.state.errorUpdatedAt > query.state.dataUpdatedAt;

/**
 * Re-reads a failed catalog once the relay socket is verified. Mounted once, app-wide.
 *
 * The catalog is relay-signed HTTP, and its signing credential lives about an hour. A user returning
 * after longer boots straight into home with that credential expired: the boot read and its one
 * retry both fail before the relay handshake finishes, and the transport cannot recover them because
 * the only way to re-mint the credential is a refresh through that socket. The query then sits failed
 * with nothing to read it again — the header falls back to a bare `?` and the background cloud
 * sockets get no owned clouds to open — until the switcher sheet's open-time refetch happens to.
 *
 * Same rule as desktop-web's catalog hook: one re-read each time the socket verifies with a failure
 * standing, and one when a read fails with the socket already verified (a read still in flight at
 * the edge that fails afterwards). "Failed" is the last SETTLED read, not `status`: a refetch with no
 * data puts `status` back to `pending`, so keying on it would turn every failed re-read into a fresh
 * failure and loop. A re-read that fails again moves nothing here, so the next one waits for the next
 * verification, a pull, or the sheet. A read that answered is never re-read, and a disabled query
 * (signed out) is skipped by `refetchQueries` itself.
 *
 * Kept out of `useCloudSessionCatalog` on purpose: several screens mount that hook, and the effect
 * belongs to the query, not to each of them.
 */
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
        // `cancelRefetch: false` joins a read already in flight instead of restarting it.
        void queryClient.refetchQueries(
            { queryKey: runtime.data.cloudsKeys.all, type: 'active', predicate: lastReadFailed },
            { cancelRefetch: false }
        );
    }, [isRelayVerified, hasFailedRead, queryClient]);
};
