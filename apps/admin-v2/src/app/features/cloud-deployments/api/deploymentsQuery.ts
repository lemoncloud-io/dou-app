/**
 * `api/cloud-deployments/deploymentsQuery.ts`
 * - The three per-service product lists and the relay's cloud list, as react-query queries.
 *
 * One query per service, keyed by goods stage and service, so switching the stage refetches instead
 * of relabelling the other stage's rows. Nothing refetches by itself — admin's query client never
 * goes stale — so the screen's Refresh button is how a deploy's progress is seen.
 */
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
    /** Present only once all three lists are in: grouping from fewer would mark every cloud partial. */
    lists?: Record<CloudService, ProductListResult>;
    errors: ServiceListError[];
    isLoading: boolean;
    isFetching: boolean;
    refetch: () => void;
}

/**
 * Folds the three results into one value. Kept at module scope so react-query reuses it: `combine`
 * reruns only when a result changes, and the structural sharing it applies keeps `lists` the same
 * object while the data is, which is what lets the page memoize the grouping on it.
 */
const combineLists = (results: UseQueryResult<ProductListResult>[]): ServiceProductLists => {
    // The queries are built from `CLOUD_SERVICES`, so the results come back in its order.
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

/** `base` is the goods base for `stage`; empty disables every query (nothing is configured). */
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

/**
 * The relay's clouds for the same stage, for whose-cloud-is-it. `base` is the relay base; empty
 * disables the query. Keyed apart from the product lists so a stage switch refetches both.
 *
 * No retry: the table waits for this list on first paint, and a second attempt at a failing relay
 * only holds the deploy targets back longer for details that are decoration.
 */
export const useDouClouds = (stage: GoodsStage, base: string) =>
    useQuery({
        queryKey: cloudDeploymentKeys.list({ stage, source: 'dou' }),
        queryFn: () => fetchDouClouds(base),
        enabled: !!base,
        refetchOnWindowFocus: false,
        retry: false,
    });
