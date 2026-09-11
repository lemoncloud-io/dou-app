/**
 * `hooks/report-logs/use-log-corpus.ts`
 * - Owns the collected corpus: the rows the server-side axes narrowed down to.
 *
 * Built on `useInfiniteQuery`, like the rest of this console is built on react-query.
 *
 * An earlier version hand-rolled the walk, and its stated reason was that a corpus is not
 * one response but many, with the screen rendering from the first page while the rest is
 * in flight — which `useInfiniteQuery` does not drive by itself. That reason went stale
 * when the ceiling dropped to 1,000: at a 500-row page the walk is TWO requests, so the
 * loop was no longer buying anything, while the hand-rolled cache next to it was
 * re-implementing `staleTime`, stale-while-revalidate and keyed eviction badly.
 *
 * What react-query provides here, none of which is worth owning:
 *
 * - **Keyed cache.** The axes are the query key, so pin/unpin/re-pin — the loop this
 *   screen exists for — is served from cache instead of re-walking a range whose answer
 *   has not changed. `staleTime` is the TTL; a stale entry still renders immediately while
 *   it refetches, which is what a monitoring screen wants (old rows beat a blank).
 * - **Correct discarding of late responses.** A key change makes it a different query, so
 *   a page still in flight for the old axes cannot land in the new corpus. That replaced a
 *   hand-written generation counter, which existed only because the transport cannot be
 *   aborted (`SealedWebTransport` takes no axios config — see `fetchReportLogs`).
 * - **Request dedupe** across the probe and the walk, and `retry` from the app's client.
 *
 * What still has to be written here:
 *
 * - **Driving the walk to the ceiling.** `fetchNextPage` is called from an effect;
 *   `nextCorpusPage` owns when to stop.
 * - **Settling the axes.** react-query fires on key change, and the date inputs fire a
 *   change per keystroke, so the axes debounce before they become a key. Without this,
 *   typing a date costs a walk per character.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useInfiniteQuery } from '@tanstack/react-query';

import { fetchReportLogs, type FetchReportLogsParams } from '../api/reportLogApi';
import { CORPUS_CAP, CORPUS_PAGE_SIZE, corpusStatus, nextCorpusPage, type CorpusPage } from '../lib/corpusPaging';
import { parseReportLog, type ReportLogRow } from '../lib/parseReportLog';

export type CorpusPhase = 'idle' | 'collecting' | 'complete' | 'truncated' | 'failed';

/**
 * How long a collected corpus is served without a refetch. Long enough to cover a round
 * of pin/unpin hops, short enough that coming back later refreshes. Arrivals newer than
 * the corpus are announced by the probe regardless, so this bounds staleness of the rows
 * already collected, not missed arrivals.
 */
export const CORPUS_STALE_MS = 120_000;

/**
 * How long an unused corpus is kept. Deliberately short: a corpus is up to 1,000 parsed
 * rows and an issue row carries its screenshots as base64, so holding many is real memory.
 */
const CORPUS_GC_MS = 300_000;

/** How long the server axes must hold still before a walk starts. */
const AXES_SETTLE_MS = 250;

export interface LogCorpus {
    /** Rows collected so far, newest arrival first (the endpoint's default order). */
    rows: ReportLogRow[];
    /** Server-reported size of the filtered set. */
    total: number;
    /** Rows the walk collected. */
    loaded: number;
    /** Rows merged from the new-log banner, counted apart so `loaded` stays within `cap`. */
    merged: number;
    phase: CorpusPhase;
    /** True while pages are still coming — including the very first one. */
    isCollecting: boolean;
    /** True when the ceiling cut the walk short and more exists on the server. */
    isTruncated: boolean;
    error: Error | null;
    /** Ceiling in force, so the UI can say the number without repeating the constant. */
    cap: number;
    /** When the rows on screen were fetched, so the UI can say how old they are. */
    fetchedAt?: number;
    /** Collect again from page 0, ignoring what is held. */
    reload: () => void;
    /** Merge newly-arrived rows onto the front, for the "new logs" banner. */
    appendHead: (rows: ReportLogRow[]) => void;
}

/** The axes that define a corpus, as one list — the type, the key and the probe share it. */
export const CORPUS_AXES = ['stage', 'type', 'from', 'to', 'level', 'runId', 'uid', 'cid'] as const;

export type CorpusParams = Pick<FetchReportLogsParams, (typeof CORPUS_AXES)[number]>;

/** Stable identity for a set of axes. Shared with the probe so the two cannot disagree. */
export const corpusKey = (params: CorpusParams): string => JSON.stringify(CORPUS_AXES.map(axis => params[axis]));

export const useLogCorpus = (
    params: CorpusParams,
    options?: { cap?: number; pageSize?: number; enabled?: boolean; settleMs?: number }
): LogCorpus => {
    const cap = options?.cap ?? CORPUS_CAP;
    const pageSize = options?.pageSize ?? CORPUS_PAGE_SIZE;
    const enabled = options?.enabled ?? true;
    const settleMs = options?.settleMs ?? AXES_SETTLE_MS;

    const requestedKey = corpusKey(params);

    // Debounce the axes into the query key. `params` is a fresh object every render, so the
    // serialized key is what the effect watches.
    const [settled, setSettled] = useState(params);
    useEffect(() => {
        const timer = setTimeout(() => setSettled(params), settleMs);
        return () => clearTimeout(timer);
        // `params` is covered by `requestedKey` — it is a fresh object every render, so
        // depending on it directly would restart the timer forever.
    }, [requestedKey, settleMs]);

    const settledKey = corpusKey(settled);

    const query = useInfiniteQuery({
        queryKey: ['admin-v2', 'report-logs', 'corpus', settledKey, cap, pageSize],
        initialPageParam: 0,
        // Parsed inside the query, so the cache holds rows rather than raw records and a
        // cache hit costs no re-parse.
        queryFn: async ({ pageParam }): Promise<CorpusPage> => {
            const data = await fetchReportLogs({ ...settled, page: pageParam, limit: pageSize });
            const list = data.list ?? [];
            return { rows: list.map(parseReportLog), total: data.total ?? 0, returned: list.length };
        },
        getNextPageParam: (_last, pages) => nextCorpusPage(pages, cap, pageSize),
        // The app's client sets `staleTime: Infinity`, which would never revalidate. This
        // screen wants the opposite: hold briefly, then refresh behind the held rows.
        staleTime: CORPUS_STALE_MS,
        gcTime: CORPUS_GC_MS,
        enabled,
    });

    const pages = query.data?.pages;

    const status = useMemo(() => corpusStatus(pages ?? [], cap), [pages, cap]);

    // Rows merged from the banner. Held outside the query cache on purpose: the cache
    // stores what a walk of these axes produces, so a later hit is the same thing a fresh
    // walk would return.
    const [merged, setMerged] = useState<ReportLogRow[]>([]);
    useEffect(() => setMerged([]), [settledKey]);

    // Drive the walk to its stopping point. `isFetchingNextPage` keeps this from stacking
    // requests while one is in flight.
    useEffect(() => {
        if (!enabled) return;
        if (query.hasNextPage && !query.isFetchingNextPage && !query.isFetching) {
            void query.fetchNextPage();
        }
    }, [enabled, query.hasNextPage, query.isFetchingNextPage, query.isFetching, query.fetchNextPage]);

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
        void query.refetch();
    }, [query.refetch]);

    const appendHead = useCallback(
        (incoming: ReportLogRow[]) => {
            if (incoming.length === 0) return;
            // The probe overlaps the corpus head by design, so dedupe against what is
            // already on screen rather than trusting the watermark.
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
