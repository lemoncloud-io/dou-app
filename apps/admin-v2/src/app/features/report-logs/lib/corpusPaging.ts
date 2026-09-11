/**
 * `lib/report-logs/corpusPaging.ts`
 * - Where the page walk stops, and what the collected pages add up to.
 *
 * These are the rules a hand-written fetch loop used to own. They moved out here when the
 * walk became a `useInfiniteQuery` (see `use-log-corpus`), because they are the part worth
 * keeping and testing — the loop itself was machinery react-query already has.
 *
 * Deduplication is part of it: a `from`/`size` window over a `createdAt` sort repeats
 * records when many share a timestamp, and counting a repeat toward the total would end
 * the walk before the real tail is fetched — silently, which is the worst way for this
 * screen to be wrong. So the count that drives the stop conditions is the distinct one.
 */
import type { ReportLogRow } from './parseReportLog';

/** Rows per request. */
export const CORPUS_PAGE_SIZE = 500;

/**
 * Ceiling on rows collected for one set of axes.
 *
 * At a 500-row page this is two round trips for the whole corpus, and one whenever the
 * server total already fits a page — what a screen people keep open all day can afford to
 * spend on every filter change. A bigger corpus buys more accurate tag and version counts
 * and pays in requests, memory and time-to-first-paint; the counts are corpus-scoped
 * either way and the screen says so, so when this is not enough the answer is a narrower
 * range, which the truncation notice asks for.
 *
 * `from = limit * page`, so the deepest request here is `from=500` — far inside
 * Elasticsearch's default `max_result_window` of 10,000.
 */
export const CORPUS_CAP = 1_000;

/** One fetched page, already parsed. */
export interface CorpusPage {
    rows: ReportLogRow[];
    /** Server-reported size of the filtered set. Only the first page's value is used. */
    total: number;
    /** How many records the server actually returned, before dedupe. */
    returned: number;
}

export interface CorpusStatus {
    /** Distinct rows across every page, in page order. */
    rows: ReportLogRow[];
    /** Server-reported size of the filtered set. */
    total: number;
    /** True when the ceiling cut the walk short and more exists on the server. */
    truncated: boolean;
}

/**
 * Flatten pages into distinct rows, trimmed to the ceiling.
 *
 * Trimming matters for the readout: a caller showing "N / cap" must never see N above the
 * ceiling it asked for.
 */
export const corpusStatus = (pages: CorpusPage[], cap = CORPUS_CAP): CorpusStatus => {
    const seen = new Set<string>();
    const rows: ReportLogRow[] = [];
    for (const page of pages) {
        for (const row of page.rows) {
            if (rows.length >= cap) break;
            // A row with no id cannot be told apart from another, so it is always kept.
            if (row.id) {
                if (seen.has(row.id)) continue;
                seen.add(row.id);
            }
            rows.push(row);
        }
    }
    const total = pages[0]?.total ?? 0;
    return { rows, total, truncated: rows.length >= cap && total > rows.length };
};

/**
 * Index of the next page to fetch, or `undefined` when the walk is done.
 *
 * Conditions, in the order they are checked:
 * 1. a short page — fewer records RETURNED than the page size — means the server has no
 *    more, whatever `total` claimed. Checked first because `total` comes from the first
 *    response and the set can shrink underneath us; trusting the page length is what keeps
 *    a stale total from driving an endless walk. Measured on the returned count rather
 *    than the deduped one, so a page of pure repeats does not read as the end of the set.
 * 2. the ceiling
 * 3. `loaded >= total`
 */
export const nextCorpusPage = (
    pages: CorpusPage[],
    cap = CORPUS_CAP,
    pageSize = CORPUS_PAGE_SIZE
): number | undefined => {
    const size = Math.max(1, pageSize);
    const last = pages[pages.length - 1];
    if (!last) return 0;
    if (last.returned < size) return undefined;

    const { rows, total } = corpusStatus(pages, cap);
    if (rows.length >= cap) return undefined;
    if (total > 0 && rows.length >= total) return undefined;

    return pages.length;
};
