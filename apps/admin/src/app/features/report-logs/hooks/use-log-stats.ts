import { useQuery } from '@tanstack/react-query';

import { fetchReportLogs, type FetchReportLogsParams, type LogListStats } from '../api/reportLogApi';
import { corpusKey, type CorpusParams } from './use-log-corpus';

export type StatsParams = CorpusParams & Pick<FetchReportLogsParams, 'groupBy' | 'aggrSize' | 'interval' | 'users'>;

export interface LogStatsResult {
    stats?: LogListStats;
    total?: number;
    supported: boolean;
    isLoading: boolean;
    error: Error | null;
    refetch: () => void;
}

export const STATS_QUERY_PREFIX = ['admin', 'report-logs', 'stats'] as const;

const STATS_STALE_MS = 120_000;

export const useLogStats = (params: StatsParams, options?: { enabled?: boolean }): LogStatsResult => {
    const key = [
        corpusKey(params),
        params.groupBy?.join(',') ?? '',
        params.aggrSize ?? '',
        params.interval ?? '',
        params.users ? 1 : 0,
    ];
    const query = useQuery({
        queryKey: [...STATS_QUERY_PREFIX, ...key],
        queryFn: () => fetchReportLogs({ ...params, page: 0, limit: 1 }),
        staleTime: STATS_STALE_MS,
        enabled: options?.enabled ?? true,
    });
    const data = query.data;
    return {
        stats: data?.stats,
        total: data?.total,
        supported: !!data?.stats,
        isLoading: query.isLoading,
        error: query.error instanceof Error ? query.error : query.error ? new Error(String(query.error)) : null,
        refetch: () => void query.refetch(),
    };
};
