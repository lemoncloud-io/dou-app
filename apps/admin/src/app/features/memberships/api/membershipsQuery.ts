import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { runtime } from '@chatic/runtime';
import { createQueryKeys } from '@chatic/shared';

import { endpointOverrideFor, relayStageOf, type RelayStage } from '../lib/targetServer';

import type { ListResult } from '@lemoncloud/chatic-backend-api/dist/cores/types';
import type { MembershipBody, MembershipView } from '@lemoncloud/chatic-backend-api';

export const membershipsKeys = createQueryKeys('memberships');
export const adminCloudsKeys = createQueryKeys('admin-clouds');
export const productPlansKeys = createQueryKeys('productPlans');

export interface MembershipListParams {
    page?: number;
    limit?: number;
    status?: string;
    productId?: string;
    platform?: string;
    userId?: string;
    isSuper?: string;
}

export const buildMembershipListParams = ({
    page = 0,
    limit = 20,
    status,
    productId,
    platform,
    userId,
    isSuper,
}: MembershipListParams = {}): Record<string, string | number> => ({
    page,
    limit,
    ...(status ? { status } : {}),
    ...(productId ? { productId } : {}),
    ...(platform ? { platform } : {}),
    ...(userId ? { userId } : {}),
    ...(isSuper ? { isSuper } : {}),
});

const endpointFor = (stage?: RelayStage) => {
    const endpoint = stage ? endpointOverrideFor(stage) : undefined;
    return endpoint ? { endpoint } : undefined;
};

export const useAdminMemberships = (
    params: MembershipListParams = {},
    refetchInterval: number | false = false,
    stage?: RelayStage
) => {
    const { subscription } = runtime.data.useRuntimeRepositories();
    const query = buildMembershipListParams(params);

    return useQuery({
        queryKey: membershipsKeys.list({ ...query, stage: stage ?? '' }),
        queryFn: () => subscription.fetchAdminMemberships(query, endpointFor(stage)),
        refetchOnWindowFocus: false,
        refetchInterval,
    });
};

export const useAdminClouds = (ownerId: string | undefined, stage?: RelayStage) => {
    const { subscription } = runtime.data.useRuntimeRepositories();

    return useQuery({
        queryKey: adminCloudsKeys.detail(`${ownerId ?? ''}@${stage ?? ''}`),
        queryFn: () => subscription.fetchAdminClouds(ownerId as string, undefined, endpointFor(stage)),
        enabled: !!ownerId,
        refetchOnWindowFocus: false,
    });
};

export const useProductPlans = () => {
    const { subscription } = runtime.data.useRuntimeRepositories();

    return useQuery({
        queryKey: productPlansKeys.lists(),
        queryFn: () => subscription.fetchPlans(),
        refetchOnWindowFocus: false,
        staleTime: Infinity,
    });
};

export const patchMembershipRow = (
    previous: ListResult<MembershipView> | undefined,
    userId: string,
    updated: MembershipView
): ListResult<MembershipView> | undefined => {
    if (!previous?.list) {
        return previous;
    }

    return { ...previous, list: previous.list.map(row => (row.userId === userId ? { ...row, ...updated } : row)) };
};

export interface UpdateByAdminInput {
    userId: string;
    body: MembershipBody;
    auto?: boolean;
    stage?: RelayStage;
}

export const useUpdateMembershipByAdmin = () => {
    const { subscription } = runtime.data.useRuntimeRepositories();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ userId, body, auto, stage }: UpdateByAdminInput) =>
            subscription.updateMembershipByAdmin(userId, body, { auto, ...endpointFor(stage) }),
        onSuccess: (updated: MembershipView, { userId }) => {
            queryClient.setQueriesData<ListResult<MembershipView>>({ queryKey: membershipsKeys.lists() }, previous =>
                patchMembershipRow(previous, userId, updated)
            );
            void queryClient.invalidateQueries({ queryKey: adminCloudsKeys.all });
        },
    });
};

export interface RefundByAdminInput {
    userId: string;
    reason: string;
    endpoint: string;
}

export const useRefundSubscriptionByAdmin = () => {
    const { subscription } = runtime.data.useRuntimeRepositories();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ userId, reason, endpoint }: RefundByAdminInput) => {
            if (relayStageOf(endpoint) !== 'd1') {
                throw new Error(`Refunds are open on Development only — refusing ${endpoint || '(no endpoint)'}.`);
            }
            return subscription.refundSubscriptionByAdmin(userId, { reason: reason.trim() }, { endpoint });
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: membershipsKeys.lists() });
            void queryClient.invalidateQueries({ queryKey: adminCloudsKeys.all });
        },
    });
};
