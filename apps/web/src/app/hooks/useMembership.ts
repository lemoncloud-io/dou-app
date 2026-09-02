import { useQuery } from '@tanstack/react-query';

import { useRuntimeRepositories } from '@chatic/app-runtime';
import { useCustomMutation } from '@chatic/shared';

import { productPlansKeys, subscriptionKeys } from './queryKeys';

import type { CreateMembershipBody, MembershipView } from '@lemoncloud/chatic-backend-api';
import type { Params } from '@lemoncloud/lemon-web-core';

/**
 * Membership + product-plan reads, moved down from `@chatic/app-runtime`'s
 * `data/hooks/subscription.ts`. Nothing here is a cacheable entity (there is no local data source
 * behind `SubscriptionRepositoryV2`), so react-query is the only cache these reads have — and a
 * cache policy belongs to the app that renders it.
 */
export const useMembershipInfo = () => {
    const { subscription } = useRuntimeRepositories();

    return useQuery<MembershipView>({
        queryKey: subscriptionKeys.detail('mine'),
        queryFn: () => subscription.fetchMembershipInfo(),
        refetchOnWindowFocus: false,
        staleTime: 0,
        refetchOnMount: 'always',
    });
};

export const useProductPlans = (params: Params = {}) => {
    const { subscription } = useRuntimeRepositories();

    return useQuery({
        queryKey: productPlansKeys.list(params),
        queryFn: () => subscription.fetchPlans(params),
        refetchOnWindowFocus: false,
    });
};

/**
 * The receipt is only ever validated server-side: `POST /memberships/0` validates against
 * Apple/Google itself (backend-api → iap-api) before creating/renewing the membership. Calling
 * iap-api's `/validate/<platform>` (or its receipt reads) directly from a client credential was
 * never a supported route, which is why no `useValidateApple`/`useValidateGoogle`/receipt hooks
 * live here — the purchase flow is `useValidateMembership` alone.
 */
export const useValidateMembership = () => {
    const { subscription } = useRuntimeRepositories();

    return useCustomMutation<MembershipView, string, { body: CreateMembershipBody; params?: Params }>(
        ({ body, params }) => subscription.validateMembership(body, params)
    );
};
