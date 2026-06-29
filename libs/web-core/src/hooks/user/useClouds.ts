import type { UseCloudsOptions, UseCloudsParams } from '../../api';
import { cloudsKeys } from '../../api';
import { useSessionAuth } from '../session';
import { useQuery } from '@tanstack/react-query';
import { fetchClouds } from '../../api';

export const useClouds = (params: UseCloudsParams = {}, options?: UseCloudsOptions) => {
    const { isAuthenticated } = useSessionAuth();
    const { enabled: legacyEnabled, ...requestParams } = params;
    const enabled = options?.enabled ?? legacyEnabled ?? true;

    return useQuery({
        queryKey: cloudsKeys.list(requestParams),
        queryFn: async () => {
            return await fetchClouds(requestParams);
        },
        enabled: isAuthenticated && enabled,
        refetchOnWindowFocus: false,
        staleTime: 0,
        refetchOnMount: 'always',
    });
};
