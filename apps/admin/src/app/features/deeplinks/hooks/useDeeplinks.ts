/**
 * Deeplinks Hooks
 *
 * TanStack Query hooks for deeplink CRUD operations.
 * Supports both DEV and PROD environments.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { createQueryKeys } from '@chatic/shared';

import { fetchDeeplinks, createDeeplink, deleteDeeplink, fetchDeeplinkByUserId } from '../services';

import type { UserView } from '@lemoncloud/chatic-backend-api';
import type { DeeplinkEnvironment } from '../types';

/** Query keys for deeplinks */
export const deeplinksKeys = createQueryKeys('deeplinks');

/**
 * Hook to fetch deeplinks list for specific environment
 */
export const useDeeplinks = (env: DeeplinkEnvironment, params: { limit?: number } = {}) => {
    const { limit = 20 } = params;

    return useQuery({
        queryKey: deeplinksKeys.list({ env, limit }),
        queryFn: async () => {
            const result = await fetchDeeplinks(env, { pageSize: limit });
            return {
                list: result.list,
                total: result.total,
            };
        },
        refetchOnWindowFocus: false,
    });
};

/**
 * Hook to fetch a single deeplink by user ID for specific environment
 */
export const useDeeplinkDetail = (env: DeeplinkEnvironment, userId: string | null) => {
    return useQuery({
        queryKey: deeplinksKeys.detail({ env, userId: userId ?? '' }),
        queryFn: () => fetchDeeplinkByUserId(env, userId!),
        enabled: !!userId,
    });
};

/**
 * Hook to create a deeplink for a user in specific environment
 */
export const useCreateDeeplink = (env: DeeplinkEnvironment) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (user: UserView) => createDeeplink(env, user),
        onSuccess: () => {
            // Invalidate deeplinks list for this environment
            queryClient.invalidateQueries({ queryKey: deeplinksKeys.list({ env }) });
        },
    });
};

/**
 * Hook to delete a deeplink in specific environment
 */
export const useDeleteDeeplink = (env: DeeplinkEnvironment) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) => deleteDeeplink(env, id),
        onSuccess: () => {
            // Invalidate deeplinks list for this environment
            queryClient.invalidateQueries({ queryKey: deeplinksKeys.list({ env }) });
        },
    });
};
