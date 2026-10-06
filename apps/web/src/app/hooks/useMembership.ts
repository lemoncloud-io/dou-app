import { useQuery, useQueryClient } from '@tanstack/react-query';

import { runtime } from '@chatic/app-runtime';
import { useCustomMutation } from '@chatic/shared';

import { productPlansKeys, subscriptionKeys } from './queryKeys';

import type { MembershipDropsResult } from '@chatic/data';
import type { CreateMembershipBody, MembershipDropsBody, MembershipView } from '@lemoncloud/chatic-backend-api';
import type { Params } from '@lemoncloud/lemon-web-core';

/**
 * Membership + product-plan reads, moved down from `@chatic/app-runtime`'s
 * `data/hooks/subscription.ts`. Nothing here is a cacheable entity (there is no local data source
 * behind `SubscriptionRepository`), so react-query is the only cache these reads have — and a
 * cache policy belongs to the app that renders it.
 */
export const useMembershipInfo = () => {
    const { subscription } = runtime.data.useRuntimeRepositories();

    return useQuery<MembershipView>({
        queryKey: subscriptionKeys.detail('mine'),
        queryFn: () => subscription.fetchMembershipInfo(),
        refetchOnWindowFocus: false,
        staleTime: 0,
        refetchOnMount: 'always',
    });
};

export const useProductPlans = (params: Params = {}) => {
    const { subscription } = runtime.data.useRuntimeRepositories();

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
    const { subscription } = runtime.data.useRuntimeRepositories();

    return useCustomMutation<MembershipView, string, { body: CreateMembershipBody; params?: Params }>(
        ({ body, params }) => subscription.validateMembership(body, params)
    );
};

/**
 * Marks which owned clouds go when the cloud quota shrinks. `cloudIds` is the final state: an
 * owned cloud left out is unmarked, and an empty list clears every mark.
 *
 * The repository caches nothing, so on success the cloud list and the membership are both
 * invalidated — every screen that shows the quota state rereads it rather than trusting a stale copy.
 */
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
