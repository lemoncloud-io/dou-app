import { useSessionAuth } from './useSessionAuth';
import { useClouds } from '../../user/useClouds';

/**
 * Fetches the relay-visible cloud catalog for authenticated users.
 */
export const useCloudSessionCatalog = () => {
    const { isAuthenticated } = useSessionAuth();
    const { data, isError: isFetchError, isFetching, refetch } = useClouds({ limit: -1, enabled: isAuthenticated });

    return {
        clouds: data?.list ?? [],
        isCloudsError: !isFetching && isFetchError,
        isFetchingClouds: isFetching,
        refetchClouds: refetch,
    };
};
