/**
 * Deeplinks Hooks
 *
 * TanStack Query hooks for deeplink CRUD operations.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { createQueryKeys } from '@chatic/shared';

import {
    fetchDeeplinks,
    createDeeplink,
    deleteDeeplink,
    checkDeeplinkExists,
    fetchDeeplinkByUserId,
} from '../services';

import type { UserView } from '@lemoncloud/chatic-backend-api';

/** Query keys for deeplinks */
export const deeplinksKeys = createQueryKeys('deeplinks');

/**
 * Hook to fetch deeplinks list
 */
export const useDeeplinks = (params: { limit?: number } = {}) => {
    const { limit = 20 } = params;

    return useQuery({
        queryKey: deeplinksKeys.list({ limit }),
        queryFn: async () => {
            const result = await fetchDeeplinks({ pageSize: limit });
            return {
                list: result.list,
                total: result.total,
            };
        },
        refetchOnWindowFocus: false,
    });
};

/**
 * Hook to check if a user already has a deeplink
 */
export const useCheckDeeplinkExists = () => {
    return useMutation({
        mutationFn: (userId: string) => checkDeeplinkExists(userId),
    });
};

/**
 * Hook to fetch a single deeplink by user ID
 */
export const useDeeplinkDetail = (userId: string | null) => {
    return useQuery({
        queryKey: deeplinksKeys.detail(userId ?? ''),
        queryFn: () => fetchDeeplinkByUserId(userId!),
        enabled: !!userId,
    });
};

/**
 * Hook to create a deeplink for a user
 */
export const useCreateDeeplink = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (user: UserView) => createDeeplink(user),
        onSuccess: () => {
            // Invalidate deeplinks list to refetch
            queryClient.invalidateQueries({ queryKey: deeplinksKeys.all });
        },
    });
};

/**
 * Hook to delete a deeplink
 */
export const useDeleteDeeplink = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) => deleteDeeplink(id),
        onSuccess: () => {
            // Invalidate deeplinks list to refetch
            queryClient.invalidateQueries({ queryKey: deeplinksKeys.all });
        },
    });
};
