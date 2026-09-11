/**
 * `lib/memberships/cloudAggregation.ts`
 * - Flattens the cloud list's status aggregation into buckets the drawer can render.
 */
import type { AggrResult } from '@lemoncloud/chatic-backend-api/dist/cores/types';

/**
 * `{ status: { active: 3, expired: 1 } }` → `[['active', 3], ['expired', 1]]`.
 *
 * Two shapes are absorbed on purpose. `ListResult.aggr` is typed `R | R[]`, so the relay may send
 * either. And every top-level key is merged rather than only `status`: the relay aggregates on
 * `status` today, but reading whatever bucket arrives keeps the panel from rendering blank if that
 * key is ever renamed.
 */
export const readAggrBuckets = (aggr: AggrResult | AggrResult[] | undefined): Array<[string, number]> => {
    const results = (Array.isArray(aggr) ? aggr : [aggr]).filter(Boolean) as AggrResult[];
    const merged: Record<string, number> = {};

    results.forEach(result =>
        Object.values(result).forEach(bucket =>
            Object.entries(bucket ?? {}).forEach(([key, count]) => {
                merged[key] = (merged[key] ?? 0) + count;
            })
        )
    );

    return Object.entries(merged);
};
