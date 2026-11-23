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
