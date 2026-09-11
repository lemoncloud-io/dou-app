/**
 * `api/memberships/membershipsQuery.ts`
 * - react-query surface over the relay's admin membership endpoints (ADR-0082).
 *
 * The wire itself lives in the shared layers (`libs/http` gateway → `libs/data` data source →
 * `SubscriptionRepositoryV2`), following the `users` feature rather than the app-local
 * `report-logs` one. Only the hooks and their cache keys belong to this console.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { runtime } from '@chatic/app-runtime';
import { createQueryKeys } from '@chatic/shared';

import { endpointOverrideFor, type RelayStage } from '../lib/targetServer';

import type { ListResult } from '@lemoncloud/chatic-backend-api/dist/cores/types';
import type { MembershipBody, MembershipView } from '@lemoncloud/chatic-backend-api';

export const membershipsKeys = createQueryKeys('memberships');
export const adminCloudsKeys = createQueryKeys('admin-clouds');
export const productPlansKeys = createQueryKeys('productPlans');

/** Filters the relay accepts on `GET /memberships/0/list`. Anything empty is left out. */
export interface MembershipListParams {
    page?: number;
    limit?: number;
    /** Membership status, e.g. `active` / `expired` / `canceled`. */
    status?: string;
    /** Receipt product, e.g. `pro_tier_01`. */
    productId?: string;
    /** `apple-inapp` / `google-inapp`. */
    platform?: string;
    /** Narrow to one user. The list carries no name or email, so this is how a user is found. */
    userId?: string;
    /** `1` finds the records still carrying the retired super flag (see the spec's S6). */
    isSuper?: string;
}

/**
 * Query params for the list call.
 *
 * Empty filters are dropped rather than sent through. The relay reads an absent key as "no
 * filter", but an empty string is matched literally — the same reason `buildReportLogListParams`
 * does this.
 */
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

/** `refetchInterval` drives the toolbar's auto-refresh toggle, mirroring `use-report-logs`. */
/**
 * The relay base for a stage, or undefined to use whatever the client was configured with.
 *
 * Kept in one place so the stage can be folded into every admin query key: switching stages has to
 * refetch, not relabel the previous relay's rows.
 */
const endpointFor = (stage?: RelayStage) => {
    const endpoint = stage ? endpointOverrideFor(stage) : undefined;
    return endpoint ? { endpoint } : undefined;
};

/** `refetchInterval` drives the header's auto-refresh toggle, mirroring the log console. */
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

/**
 * One user's clouds with the status aggregation, for the detail drawer.
 *
 * Disabled until a row is selected — the endpoint without an owner would list every user's clouds.
 */
export const useAdminClouds = (ownerId: string | undefined, stage?: RelayStage) => {
    const { subscription } = runtime.data.useRuntimeRepositories();

    return useQuery({
        queryKey: adminCloudsKeys.detail(`${ownerId ?? ''}@${stage ?? ''}`),
        queryFn: () => subscription.fetchAdminClouds(ownerId as string, undefined, endpointFor(stage)),
        enabled: !!ownerId,
        refetchOnWindowFocus: false,
    });
};

/**
 * The sellable plan catalog, for the grade selector. The relay refuses a product it cannot find.
 *
 * Named after `apps/web`'s `useProductPlans` — same call, same endpoint. No `limit` is sent: the
 * relay's `doGetPlans` ignores pagination and returns the whole catalog.
 */
export const useProductPlans = () => {
    const { subscription } = runtime.data.useRuntimeRepositories();

    return useQuery({
        queryKey: productPlansKeys.lists(),
        queryFn: () => subscription.fetchPlans(),
        refetchOnWindowFocus: false,
        staleTime: Infinity,
    });
};

/**
 * Replaces one row of a cached page with the relay's updated view. Exported for its test; the pages
 * a filter has not matched are left untouched, and an absent page stays absent.
 */
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
    /** Provision clouds up to the raised quota immediately. Off unless the operator asks. */
    auto?: boolean;
    /** The relay this write lands on. The console shows it in the confirmation. */
    stage?: RelayStage;
}

/**
 * The override write.
 *
 * The response IS the relay's freshly derived view, so the matching row is patched in place rather
 * than refetched. The list is an ES search: invalidating it here would race the index and put the
 * pre-write row back on screen, which is exactly the "did my change stick?" confusion the response
 * is there to avoid. The operator refetches when they want the whole list re-read.
 *
 * The cloud panel IS invalidated — a grant restores suspended clouds and a block suspends them, and
 * that outcome only exists on the server.
 */
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
