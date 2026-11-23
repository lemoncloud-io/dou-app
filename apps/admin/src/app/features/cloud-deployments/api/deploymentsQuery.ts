import { useQueries, useQuery, type UseQueryResult } from '@tanstack/react-query';

import { createQueryKeys } from '@chatic/shared';

import { CLOUD_SERVICES, type CloudService } from '../lib/cloudGroups';
import { fetchDouClouds } from './douCloudsApi';
import { fetchServiceProducts, type ProductListResult } from './goodsApi';

import type { GoodsStage } from '../lib/goodsTarget';

export const cloudDeploymentKeys = createQueryKeys('cloud-deployments');

export interface ServiceListError {
    service: CloudService;
    message: string;
}

export interface ServiceProductLists {
    lists?: Record<CloudService, ProductListResult>;
    errors: ServiceListError[];
    isLoading: boolean;
    isFetching: boolean;
    refetch: () => void;
}

const combineLists = (results: UseQueryResult<ProductListResult>[]): ServiceProductLists => {
    const [backend, sockets, socials] = results.map(result => result.data);
    const errors = results.flatMap((result, index) =>
        result.error ? [{ service: CLOUD_SERVICES[index], message: result.error.message }] : []
    );

    return {
        lists: backend && sockets && socials && errors.length === 0 ? { backend, sockets, socials } : undefined,
        errors,
        isLoading: results.some(result => result.isLoading),
        isFetching: results.some(result => result.isFetching),
        refetch: () => results.forEach(result => void result.refetch()),
    };
};

export const useServiceProductLists = (stage: GoodsStage, base: string): ServiceProductLists =>
    useQueries({
        queries: CLOUD_SERVICES.map(service => ({
            queryKey: cloudDeploymentKeys.list({ stage, service }),
            queryFn: () => fetchServiceProducts(base, service),
            enabled: !!base,
            refetchOnWindowFocus: false,
        })),
        combine: combineLists,
    });

export const useDouClouds = (stage: GoodsStage, base: string) =>
    useQuery({
        queryKey: cloudDeploymentKeys.list({ stage, source: 'dou' }),
        queryFn: () => fetchDouClouds(base),
        enabled: !!base,
        refetchOnWindowFocus: false,
        retry: false,
    });
