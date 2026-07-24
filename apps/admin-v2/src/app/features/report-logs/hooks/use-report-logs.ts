/**
 * `hooks/report-logs/use-report-logs.ts`
 * - react-query wrapper over `fetchReportLogs`, mirroring `use-device-list`.
 *   `refetchInterval` drives the optional auto-refresh toggle.
 */
import { useQuery } from '@tanstack/react-query';

import { fetchReportLogs, type FetchReportLogsParams } from '../api/reportLogApi';

export const useReportLogs = (params: FetchReportLogsParams = {}, refetchInterval: number | false = false) =>
    useQuery({
        queryKey: ['admin-v2', 'report-logs', params],
        queryFn: () => fetchReportLogs(params),
        refetchOnWindowFocus: false,
        refetchInterval,
    });
