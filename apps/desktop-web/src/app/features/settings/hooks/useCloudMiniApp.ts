import { useCallback } from 'react';

import { useQuery, useQueryClient } from '@tanstack/react-query';

import { runtime } from '@chatic/runtime-react';

export const miniAppUrlKey = (cloudId: string) => [...runtime.data.cloudsKeys.detail(cloudId), 'miniApp'] as const;

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
            await queryClient.cancelQueries({ queryKey: miniAppUrlKey(forCloudId) });
            queryClient.setQueryData(miniAppUrlKey(forCloudId), stored);
            return stored;
        },
        [cloud, queryClient]
    );

    return { url: cloudId ? data : undefined, freshUrl, save };
};
