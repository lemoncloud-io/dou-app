/**
 * Deeplinks Hooks
 *
 * TanStack Query hooks for deeplink CRUD operations.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { createQueryKeys } from '@chatic/shared';

import {
    fetchDeeplinks,
    createDeeplinkFromInvite,
    deleteDeeplink,
    deleteAllDeeplinks,
    fetchDeeplinkByShortCode,
    inviteUser,
} from '../services';

import type { MyUserInviteBody } from '@lemoncloud/chatic-backend-api';

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
 * Hook to fetch a single deeplink by short code
 */
export const useDeeplinkDetail = (shortCode: string | null) => {
    return useQuery({
        queryKey: deeplinksKeys.detail({ shortCode: shortCode ?? '' }),
        queryFn: () => fetchDeeplinkByShortCode(shortCode!),
        enabled: !!shortCode,
    });
};

/**
 * Hook to invite user via backend API and create deeplink
 */
export const useInviteAndCreateDeeplink = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (body: MyUserInviteBody) => {
            const invite = await inviteUser(body);
            return createDeeplinkFromInvite(invite);
        },
        onSuccess: () => {
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
            queryClient.invalidateQueries({ queryKey: deeplinksKeys.all });
        },
    });
};

/**
 * Hook to delete all deeplinks
 */
export const useDeleteAllDeeplinks = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: () => deleteAllDeeplinks(),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: deeplinksKeys.all });
        },
    });
};
