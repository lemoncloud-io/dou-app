/**
 * `hooks/report-logs/use-log-stats.ts`
 * - Asks the server to count, instead of counting the rows this screen fetched.
 *
 * The fetched population stops at one page, so a count over it answers "how many in the newest
 * 500" — fine for reading one user's evening, wrong for "how often did this break today". The
 * list endpoint can aggregate over the whole match (`groupBy`, `interval`, `users` → `stats`), so
 * the screens that report counts ask it to.
 *
 * One record comes back with the counts (`limit: 1`); the counts do not depend on the page size,
 * and a single record keeps the answer small even when the match holds screenshot-laden reports.
 *
 * `supported` is false when the answer carries no `stats` at all: a backend without the feature
 * ignores the parameters, and the caller must fall back to the fetched rows rather than show zeros.
 */
import { useQuery } from '@tanstack/react-query';

import { fetchReportLogs, type FetchReportLogsParams, type LogListStats } from '../api/reportLogApi';
import { corpusKey, type CorpusParams } from './use-log-corpus';

export type StatsParams = CorpusParams & Pick<FetchReportLogsParams, 'groupBy' | 'aggrSize' | 'interval' | 'users'>;

export interface LogStatsResult {
    stats?: LogListStats;
    /** Size of the whole match. */
    total?: number;
    /** False when the server answered without `stats` — it does not aggregate yet. */
    supported: boolean;
    isLoading: boolean;
    error: Error | null;
    refetch: () => void;
}

export const STATS_QUERY_PREFIX = ['admin-v2', 'report-logs', 'stats'] as const;

/** Same freshness as the fetched rows, so counts and rows on one screen are from the same moment. */
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
