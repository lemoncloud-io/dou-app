/**
 * `hooks/report-logs/use-new-log-probe.ts`
 * - Watches for rows that arrived after the corpus was collected, without disturbing it.
 *
 * One short request, not a refresh: page 0 with a small limit. That works because the
 * endpoint's default sort is `createdAt: desc` (no `sort` param is sent — see
 * `reportLogApi`), so the newest rows are always on the first page.
 *
 * The probe never writes to the corpus. It reports what it found and holds the parsed
 * rows; the operator's click is what merges them (`NewLogsBanner` → `appendHead`). That
 * is the whole reason this is a separate hook rather than a refetch interval on the
 * corpus — a corpus refresh is a multi-page re-walk that would discard scroll position,
 * selection, and any reading in progress.
 *
 * Two failure modes shaped the design and are worth stating, because both silently lose
 * data if handled naively:
 *
 * 1. **The window overflows.** More rows can arrive between ticks than one page holds.
 *    Merging only what fits advances the watermark past the rows that did not, and they
 *    can never be probed again — a permanent hole with nothing on screen to say so. So
 *    an overflowed window is reported as such (`overflowed`) and the caller re-walks
 *    instead of merging.
 * 2. **The corpus is empty.** There is then no watermark to compare against, and treating
 *    that as "cannot probe" means an empty view never notices anything ever again —
 *    exactly the state you are in after pinning a run that has not logged yet. An empty
 *    corpus instead treats everything in range as new.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchReportLogs } from '../api/reportLogApi';
import { parseReportLog, type ReportLogRow } from '../lib/parseReportLog';
import { corpusKey, type CorpusParams } from './use-log-corpus';

/** How often to look. Matches the old screen's auto-refresh cadence. */
export const PROBE_INTERVAL_MS = 15_000;
/**
 * Rows per probe. Large enough that an ordinary 15-second arrival fits, small enough that
 * the request stays cheap when issue records with base64 screenshots are in range. When
 * it does not fit, `overflowed` says so rather than the count quietly being wrong.
 */
export const PROBE_LIMIT = 50;

export interface NewLogProbe {
    /** Rows newer than the corpus watermark, waiting to be merged. */
    rows: ReportLogRow[];
    count: number;
    /**
     * True when every row the probe fetched was newer than the watermark — meaning there
     * are probably more beyond the page, so `rows` is a floor and not the whole set.
     * Merging in this state would strand the remainder; re-collect instead.
     */
    overflowed: boolean;
    /** Hand the rows to the caller and reset the probe. */
    take: () => ReportLogRow[];
    /** Forget what was found, for a caller that re-collected instead of merging. */
    reset: () => void;
}

export const useNewLogProbe = (
    params: CorpusParams,
    /**
     * Newest arrival time in the corpus, or `undefined` when it is empty. An empty corpus
     * is a valid state to probe from, not a reason to stop.
     */
    headCreatedAt: number | undefined,
    options?: { enabled?: boolean; intervalMs?: number }
): NewLogProbe => {
    const enabled = options?.enabled ?? true;
    const intervalMs = options?.intervalMs ?? PROBE_INTERVAL_MS;

    const [rows, setRows] = useState<ReportLogRow[]>([]);
    const [overflowed, setOverflowed] = useState(false);

    // Read inside the interval callback rather than listed as dependencies, so a steadily
    // advancing watermark does not tear down and rebuild the timer on every merge. Written
    // in an effect, not during render: a render React discards would otherwise leave the
    // refs advanced, and the interval would then be probing one set of axes while
    // comparing against another set's watermark.
    const headRef = useRef(headCreatedAt);
    const paramsRef = useRef(params);
    useEffect(() => {
        headRef.current = headCreatedAt;
        paramsRef.current = params;
    });

    const paramsKey = corpusKey(params);

    useEffect(() => {
        // A new set of axes means the previous probe's finds belong to a different question.
        setRows([]);
        setOverflowed(false);
        if (!enabled) return;

        let cancelled = false;

        const probe = async () => {
            // Nobody is looking at a hidden tab, so nothing needs announcing — and a
            // console left open in a background tab would otherwise spend four requests a
            // minute forever. The next visible tick catches up; the watermark does not
            // move while hidden, so nothing is missed.
            if (typeof document !== 'undefined' && document.hidden) return;
            const head = headRef.current;
            try {
                const data = await fetchReportLogs({ ...paramsRef.current, page: 0, limit: PROBE_LIMIT });
                if (cancelled) return;
                const returned = (data.list ?? []).map(parseReportLog);
                // With no watermark the whole page is "new" — but only if the corpus is
                // genuinely empty, which is the only way `head` is undefined.
                const fresh = head === undefined ? returned : returned.filter(row => (row.createdAt ?? 0) > head);
                setRows(fresh);
                // Every row on a full page being newer than the watermark means the page
                // is a floor, not the answer.
                setOverflowed(fresh.length >= PROBE_LIMIT && returned.length >= PROBE_LIMIT);
            } catch {
                // A failed probe is not worth surfacing — the corpus is unaffected and the
                // next tick retries. Reporting it would put an error on a working screen.
                // Note the watermark does not move on failure, so a run of failures widens
                // the window rather than losing it; overflow then reports the truth.
            }
        };

        const timer = setInterval(() => void probe(), intervalMs);
        return () => {
            cancelled = true;
            clearInterval(timer);
        };
        // `params` and `headCreatedAt` are read through the refs above, deliberately: a
        // steadily advancing watermark must not rebuild the timer.
    }, [paramsKey, enabled, intervalMs]);

    const take = useCallback(() => {
        const taken = rows;
        setRows([]);
        setOverflowed(false);
        return taken;
    }, [rows]);

    const reset = useCallback(() => {
        setRows([]);
        setOverflowed(false);
    }, []);

    return { rows, count: rows.length, overflowed, take, reset };
};
