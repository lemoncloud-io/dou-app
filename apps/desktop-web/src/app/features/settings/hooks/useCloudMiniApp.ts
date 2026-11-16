import { useCallback } from 'react';

import { useQuery, useQueryClient } from '@tanstack/react-query';

import { runtime } from '@chatic/app-runtime';

/** The react-query key of a cloud's mini app link, under the cloud's own detail key. */
export const miniAppUrlKey = (cloudId: string) => [...runtime.data.cloudsKeys.detail(cloudId), 'miniApp'] as const;

/**
 * A cloud's mini app link on the relay — the one address its owner sets, `''` for none — and the
 * owner's save. React-query is the only cache: the repository never writes it locally.
 *
 * - `url` is `undefined` until the first read settles, and for no cloud.
 * - `ensureUrl` answers from the cache when it has the link, else reads it, so a press right after the
 *   screen opens still opens what the relay holds rather than the hub.
 * - `freshUrl` always asks the relay, so the owner edits what it holds now, not a cached copy.
 * - `save` resolves with what the relay stored and puts it in the cache; a refusal rejects and leaves
 *   the cache as it was.
 */
export const useCloudMiniApp = (cloudId: string | null) => {
    const { cloud } = runtime.data.useRuntimeRepositories();
    const queryClient = useQueryClient();

    const { data } = useQuery({
        queryKey: miniAppUrlKey(cloudId ?? ''),
        queryFn: () => cloud.fetchMiniAppUrl(cloudId ?? ''),
        enabled: !!cloudId,
        refetchOnWindowFocus: false,
    });

    const ensureUrl = useCallback(
        (forCloudId: string) =>
            queryClient.ensureQueryData({
                queryKey: miniAppUrlKey(forCloudId),
                queryFn: () => cloud.fetchMiniAppUrl(forCloudId),
            }),
        [cloud, queryClient]
    );

    /** Read the link from the relay now, whatever the cache holds — for the owner about to edit it. */
    const freshUrl = useCallback(
        (forCloudId: string) =>
            queryClient.fetchQuery({
                queryKey: miniAppUrlKey(forCloudId),
                queryFn: () => cloud.fetchMiniAppUrl(forCloudId),
                staleTime: 0,
            }),
        [cloud, queryClient]
    );

    const save = useCallback(
        async (forCloudId: string, url: string): Promise<string> => {
            const stored = await cloud.saveMiniAppUrl(forCloudId, url);
            // A read still out would land after this and put the old link back.
            await queryClient.cancelQueries({ queryKey: miniAppUrlKey(forCloudId) });
            queryClient.setQueryData(miniAppUrlKey(forCloudId), stored);
            return stored;
        },
        [cloud, queryClient]
    );

    return { url: cloudId ? data : undefined, ensureUrl, freshUrl, save };
};
