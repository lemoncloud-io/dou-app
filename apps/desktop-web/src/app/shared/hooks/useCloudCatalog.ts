import { useEffect, useMemo, useState } from 'react';

import { useQuery } from '@tanstack/react-query';

import { runtime } from '@chatic/runtime';

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

    const [lastReadFailed, setLastReadFailed] = useState(false);
    useEffect(() => {
        if (!isFetching) setLastReadFailed(isFetchError);
    }, [isFetching, isFetchError]);

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

export const useOwnedCloudIds = (): Set<string> => {
    const { clouds } = useCloudSessionCatalog();
    const key = clouds
        .map(c => c.id)
        .sort()
        .join('\n');
    return useMemo(() => new Set(key ? key.split('\n') : []), [key]);
};
