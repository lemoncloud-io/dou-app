import { useQuery, useQueryClient } from '@tanstack/react-query';

import { runtime, type MembershipDropsResult } from '@chatic/runtime-react';
import { useCustomMutation } from '@chatic/shared';

import { productPlansKeys, subscriptionKeys } from './queryKeys';
import { useIsAccountGuest } from './useMyUser';

import type { CreateMembershipBody, MembershipDropsBody, MembershipView } from '@lemoncloud/chatic-backend-api';
type Params = Record<string, unknown>;

const GUEST_MEMBERSHIP: MembershipView = { isValid: false };

export const useMembershipInfo = () => {
    const { subscription } = runtime.data.useRuntimeRepositories();
    const isGuest = useIsAccountGuest();

    return useQuery<MembershipView>({
        queryKey: subscriptionKeys.detail(isGuest ? 'guest' : 'mine'),
        queryFn: isGuest ? () => Promise.resolve(GUEST_MEMBERSHIP) : () => subscription.fetchMembershipInfo(),
        refetchOnWindowFocus: false,
        staleTime: 0,
        refetchOnMount: 'always',
    });
};

export const useProductPlans = (params: Params = {}, { enabled = true }: { enabled?: boolean } = {}) => {
    const { subscription } = runtime.data.useRuntimeRepositories();

    return useQuery({
        queryKey: productPlansKeys.list(params),
        queryFn: () => subscription.fetchPlans(params),
        refetchOnWindowFocus: false,
        enabled,
    });
};

export const useValidateMembership = () => {
    const { subscription } = runtime.data.useRuntimeRepositories();

    return useCustomMutation<MembershipView, string, { body: CreateMembershipBody; params?: Params }>(
        ({ body, params }) => subscription.validateMembership(body, params)
    );
};

export const useMarkDrops = () => {
    const { subscription } = runtime.data.useRuntimeRepositories();
    const queryClient = useQueryClient();

    return useCustomMutation<MembershipDropsResult, string, MembershipDropsBody>(body => subscription.markDrops(body), {
        onSuccess: () =>
            Promise.all([
                queryClient.invalidateQueries({ queryKey: runtime.data.cloudsKeys.all }),
                queryClient.invalidateQueries({ queryKey: subscriptionKeys.all }),
            ]),
    });
};
