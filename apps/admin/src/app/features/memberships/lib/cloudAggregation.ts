import type { AggrResult } from '@lemoncloud/chatic-backend-api/dist/cores/types';

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
