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

/**
 * Hard ceiling on requests per set of axes — the backstop that makes the walk terminate whatever
 * the server returns.
 *
 * Every other stop condition is derived from the response, so a response that keeps looking like
 * "there is more" defeats it. The distinct-row ceiling is the clearest case: it is measured on the
 * deduped count, which is exactly the quantity that stalls when pages repeat, so it cannot fire in
 * the situation it most needs to. This one counts requests, and those only go up.
 *
 * The healthy walk is `CORPUS_CAP / CORPUS_PAGE_SIZE` = two pages, so this leaves generous room for
 * repeat-heavy bands while bounding what one filter change can cost.
 */
export const MAX_CORPUS_PAGES = 8;

/**
 * How many consecutive pages may add no new distinct rows before the walk gives up.
 *
 * One such page is not evidence of the end, which is why it is tolerated: the page was full, so
 * the server has more, and a `from`/`size` window over a non-unique `createdAt` can hand back a
 * band it already gave. Two in a row is different — the window is not advancing, and a third
 * request buys the same answer.
 */
const STALLED_PAGE_LIMIT = 2;

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
    // Not `rows.length >= cap && …`: the ceiling is no longer the only reason a walk stops, and
    // tying the notice to it made every other early stop silent — the screen would claim a
    // complete corpus while holding a fraction of the set.
    return { rows, total, truncated: total > rows.length };
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
 * 2. the request ceiling
 * 3. a stalled window — `STALLED_PAGE_LIMIT` consecutive pages that added nothing
 * 4. the distinct-row ceiling
 * 5. `loaded >= total`
 *
 * **Conditions 2 and 3 are why this terminates at all.** Without them, a server that answers
 * every request with a FULL page of rows it already sent walks forever: the page is not short, so
 * 1 does not fire; the deduped count never grows, so neither 4 nor 5 can. That is not a
 * hypothetical — batch upload stamps a whole batch with one `createdAt`, and `from`/`size` over a
 * non-unique sort key is unstable inside a tie band, which is precisely a full page of repeats.
 *
 * An endless walk is worse than it sounds, because `hasNextPage` never goes false: the console's
 * "collecting" state is derived from it, and that state disables both the re-collect button and
 * the new-log probe. So the screen ends up unable to refresh and unable to notice arrivals — it
 * reads as "the latest logs will not load", with nothing pointing at pagination.
 *
 * An earlier revision deliberately kept walking through repeated pages, reasoning that a full page
 * means the server has more and only the distinct count stalled. That is right about one page,
 * which is why one is still tolerated; what it lacked was any bound on how many times in a row it
 * could be true.
 */
/**
 * How many pages at the END of the walk added no new distinct rows.
 *
 * Counted by re-flattening the prefix rather than tracked incrementally, because `nextCorpusPage`
 * is a pure function of the pages it is handed — react-query calls it with the accumulated array
 * and keeps no state of its own for this.
 */
const stalledPages = (pages: CorpusPage[], cap: number): number => {
    let stalled = 0;
    for (let i = pages.length; i > 0; i -= 1) {
        const withPage = corpusStatus(pages.slice(0, i), cap).rows.length;
        const withoutPage = corpusStatus(pages.slice(0, i - 1), cap).rows.length;
        if (withPage > withoutPage) break;
        stalled += 1;
    }
    return stalled;
};

export const nextCorpusPage = (
    pages: CorpusPage[],
    cap = CORPUS_CAP,
    pageSize = CORPUS_PAGE_SIZE,
    maxPages = MAX_CORPUS_PAGES
): number | undefined => {
    const size = Math.max(1, pageSize);
    const last = pages[pages.length - 1];
    if (!last) return 0;
    if (last.returned < size) return undefined;
    if (pages.length >= Math.max(1, maxPages)) return undefined;

    const { rows, total } = corpusStatus(pages, cap);
    if (stalledPages(pages, cap) >= STALLED_PAGE_LIMIT) return undefined;
    if (rows.length >= cap) return undefined;
    if (total > 0 && rows.length >= total) return undefined;

    return pages.length;
};
