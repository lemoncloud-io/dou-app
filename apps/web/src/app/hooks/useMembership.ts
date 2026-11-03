import { useQuery, useQueryClient } from '@tanstack/react-query';

import { runtime } from '@chatic/app-runtime';
import { useCustomMutation } from '@chatic/shared';

import { productPlansKeys, subscriptionKeys } from './queryKeys';
import { useIsAccountGuest } from './useMyUser';

import type { MembershipDropsResult } from '@chatic/data';
import type { CreateMembershipBody, MembershipDropsBody, MembershipView } from '@lemoncloud/chatic-backend-api';
import type { Params } from '@lemoncloud/lemon-web-core';

/** What the relay answers for a user with no membership — and a guest account never has one. */
const GUEST_MEMBERSHIP: MembershipView = { isValid: false };

/**
 * Membership + product-plan reads, moved down from `@chatic/app-runtime`'s
 * `data/hooks/subscription.ts`. Nothing here is a cacheable entity (there is no local data source
 * behind `SubscriptionRepository`), so react-query is the only cache these reads have — and a
 * cache policy belongs to the app that renders it.
 *
 * A guest account is answered with {@link GUEST_MEMBERSHIP}, without a request: a membership is
 * bought by a signed-in account, so a guest's read can only come back empty. It is answered rather
 * than disabled because the website hand-off waits for a membership that was READ (`isSuccess`) and
 * would wait for good on a disabled query, and home's pull calls `refetch`, which ignores `enabled`.
 * The guest's answer has a key of its own, so signing in reads the account's membership instead of
 * keeping the guest's.
 */
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
