/**
 * `hooks/report-logs/use-log-stats-many.ts`
 * - Several server aggregations at once, for comparisons the server cannot make in one answer.
 *
 * `groupBy` counts per value but cannot count distinct users per value. Asking once per value —
 * users of app 0.29.2, users of 0.29.1, … — answers that, at one small request each. Callers keep
 * the list short (the top few values); each entry is cached like a single `useLogStats`.
 */
import { useQueries } from '@tanstack/react-query';

import { fetchReportLogs } from '../api/reportLogApi';
import { corpusKey } from './use-log-corpus';
import { STATS_QUERY_PREFIX, type LogStatsResult, type StatsParams } from './use-log-stats';

const STATS_STALE_MS = 120_000;

export const useLogStatsMany = (list: StatsParams[], options?: { enabled?: boolean }): LogStatsResult[] =>
    useQueries({
        queries: list.map(params => ({
            queryKey: [
                ...STATS_QUERY_PREFIX,
                corpusKey(params),
                params.groupBy?.join(',') ?? '',
                params.aggrSize ?? '',
                params.interval ?? '',
                params.users ? 1 : 0,
            ],
            queryFn: () => fetchReportLogs({ ...params, page: 0, limit: 1 }),
            staleTime: STATS_STALE_MS,
            enabled: options?.enabled ?? true,
        })),
    }).map(query => ({
        stats: query.data?.stats,
        total: query.data?.total,
        supported: !!query.data?.stats,
        isLoading: query.isLoading,
        error: query.error instanceof Error ? query.error : query.error ? new Error(String(query.error)) : null,
        refetch: () => void query.refetch(),
    }));
