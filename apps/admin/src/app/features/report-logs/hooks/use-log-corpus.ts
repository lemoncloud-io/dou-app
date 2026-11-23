import { useCallback, useEffect, useMemo, useState } from 'react';

import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';

import { ROUND_2_AXES, fetchReportLogs, type FetchReportLogsParams } from '../api/reportLogApi';
import { CORPUS_CAP, CORPUS_PAGE_SIZE, corpusStatus, nextCorpusPage, type CorpusPage } from '../lib/corpusPaging';
import { parseReportLog, type ReportLogRow } from '../lib/parseReportLog';

export type CorpusPhase = 'idle' | 'collecting' | 'complete' | 'truncated' | 'failed';

export const CORPUS_STALE_MS = 120_000;

const CORPUS_GC_MS = 300_000;

const AXES_SETTLE_MS = 250;

export interface LogCorpus {
    rows: ReportLogRow[];
    total: number;
    loaded: number;
    merged: number;
    phase: CorpusPhase;
    isCollecting: boolean;
    isTruncated: boolean;
    error: Error | null;
    cap: number;
    fetchedAt?: number;
    reload: () => void;
    appendHead: (rows: ReportLogRow[]) => void;
}

export const CORPUS_QUERY_PREFIX = ['admin', 'report-logs', 'corpus'] as const;

export const CORPUS_AXES = ['stage', 'type', 'from', 'to', 'level', 'runId', 'uid', 'cid', ...ROUND_2_AXES] as const;

export type CorpusParams = Pick<FetchReportLogsParams, (typeof CORPUS_AXES)[number]>;

export const corpusKey = (params: CorpusParams): string => JSON.stringify(CORPUS_AXES.map(axis => params[axis]));

export const useLogCorpus = (
    params: CorpusParams,
    options?: { cap?: number; pageSize?: number; enabled?: boolean; settleMs?: number }
): LogCorpus => {
    const client = useQueryClient();
    const cap = options?.cap ?? CORPUS_CAP;
    const pageSize = options?.pageSize ?? CORPUS_PAGE_SIZE;
    const enabled = options?.enabled ?? true;
    const settleMs = options?.settleMs ?? AXES_SETTLE_MS;

    const requestedKey = corpusKey(params);

    const [settled, setSettled] = useState(params);
    useEffect(() => {
        const timer = setTimeout(() => setSettled(params), settleMs);
        return () => clearTimeout(timer);
    }, [requestedKey, settleMs]);

    const settledKey = corpusKey(settled);
    const live = enabled && settledKey === requestedKey;

    const query = useInfiniteQuery({
        queryKey: [...CORPUS_QUERY_PREFIX, settledKey, cap, pageSize],
        initialPageParam: 0,
        queryFn: async ({ pageParam }): Promise<CorpusPage> => {
            const data = await fetchReportLogs({ ...settled, page: pageParam, limit: pageSize });
            const list = data.list ?? [];
            return { rows: list.map(parseReportLog), total: data.total ?? 0, returned: list.length };
        },
        getNextPageParam: (_last, pages) => nextCorpusPage(pages, cap, pageSize),
        staleTime: CORPUS_STALE_MS,
        gcTime: CORPUS_GC_MS,
        enabled: live,
    });

    const pages = query.data?.pages;

    const status = useMemo(() => corpusStatus(pages ?? [], cap), [pages, cap]);

    const [merged, setMerged] = useState<ReportLogRow[]>([]);
    useEffect(() => setMerged([]), [settledKey]);

    useEffect(() => {
        if (!live) return;
        if (query.hasNextPage && !query.isFetchingNextPage && !query.isFetching) {
            void query.fetchNextPage();
        }
    }, [live, query.hasNextPage, query.isFetchingNextPage, query.isFetching, query.fetchNextPage]);

    const rows = useMemo(() => (merged.length ? merged.concat(status.rows) : status.rows), [merged, status.rows]);

    const isCollecting = query.isFetching || query.hasNextPage === true;

    const phase: CorpusPhase = !enabled
        ? 'idle'
        : query.isError
          ? 'failed'
          : isCollecting
            ? 'collecting'
            : status.truncated
              ? 'truncated'
              : 'complete';

    const reload = useCallback(() => {
        setMerged([]);
        client.removeQueries({ queryKey: [...CORPUS_QUERY_PREFIX], type: 'inactive' });
        void query.refetch();
    }, [client, query.refetch]);

    const appendHead = useCallback(
        (incoming: ReportLogRow[]) => {
            if (incoming.length === 0) return;
            const known = new Set(rows.map(row => row.id).filter(Boolean));
            const fresh = incoming.filter(row => !row.id || !known.has(row.id));
            if (fresh.length === 0) return;
            setMerged(prev => fresh.concat(prev));
        },
        [rows]
    );

    return {
        rows,
        total: status.total,
        loaded: status.rows.length,
        merged: merged.length,
        phase,
        isCollecting,
        isTruncated: status.truncated,
        error: query.error instanceof Error ? query.error : query.error ? new Error(String(query.error)) : null,
        cap,
        fetchedAt: query.dataUpdatedAt || undefined,
        reload,
        appendHead,
    };
};
