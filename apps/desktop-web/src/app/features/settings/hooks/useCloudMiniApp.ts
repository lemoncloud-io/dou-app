import { useCallback } from 'react';

import { useQuery, useQueryClient } from '@tanstack/react-query';

import { runtime } from '@chatic/app-runtime';

/** The react-query key of a cloud's mini app link, under the cloud's own detail key. */
export const miniAppUrlKey = (cloudId: string) => [...runtime.data.cloudsKeys.detail(cloudId), 'miniApp'] as const;

/**
 * A cloud's mini app link on the relay — the one address its owner sets, `''` for none — and the
 * owner's save. React-query is the only cache: the repository never writes it locally.
 *
 * The owner can change the link from another device at any time, and nothing tells this one, so the
 * cache is never trusted to open or edit it: the app's default `staleTime: Infinity` would otherwise
 * keep the first read for the whole session, and a press would open an address the owner has replaced.
 *
 * - `url` is `undefined` until the first read settles, and for no cloud. It is read again whenever a
 *   screen showing it mounts; it only names the host in a hint.
 * - `freshUrl` always asks the relay. Opening and editing both go through it, so a press opens — and
 *   the owner edits — what the relay holds now.
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
        staleTime: 0,
        refetchOnWindowFocus: false,
    });

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

    return { url: cloudId ? data : undefined, freshUrl, save };
};
