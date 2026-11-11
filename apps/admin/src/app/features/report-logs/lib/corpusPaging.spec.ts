/**
 * `lib/report-logs/corpusPaging.spec.ts`
 *
 * Ported from the hand-written fetch loop these rules used to live in. The loop is gone
 * (react-query drives the walk now) but the stop conditions and the dedupe are the part
 * that was worth keeping, so the assertions came across.
 */
import { describe, expect, it } from 'vitest';

import {
    CORPUS_CAP,
    CORPUS_PAGE_SIZE,
    MAX_CORPUS_PAGES,
    corpusStatus,
    nextCorpusPage,
    type CorpusPage,
} from './corpusPaging';
import type { ReportLogRow } from './parseReportLog';

const row = (id: string): ReportLogRow => ({
    id,
    type: 'log-entry',
    title: 't',
    payload: null,
    raw: {},
    parseError: false,
});

/** A page of `count` rows with ids prefixed by `prefix`. */
const page = (prefix: string, count: number, total: number, returned = count): CorpusPage => ({
    rows: Array.from({ length: count }, (_, i) => row(`${prefix}${i}`)),
    total,
    returned,
});

describe('corpusStatus', () => {
    it('flattens pages in order', () => {
        const status = corpusStatus([page('a', 2, 4), page('b', 2, 4)]);

        expect(status.rows.map(r => r.id)).toEqual(['a0', 'a1', 'b0', 'b1']);
        expect(status.total).toBe(4);
        expect(status.truncated).toBe(false);
    });

    it('counts a record once when deep paging repeats it', () => {
        // The `from`/`size` window shifts under a `createdAt` sort when records share a
        // timestamp, so a page can repeat a row from the previous one.
        const first = page('a', 2, 3);
        const second: CorpusPage = { rows: [first.rows[1], row('b0')], total: 3, returned: 2 };

        expect(corpusStatus([first, second]).rows.map(r => r.id)).toEqual(['a0', 'a1', 'b0']);
    });

    it('keeps every id-less row, since two of them cannot be told apart', () => {
        const rows = [row(''), row('')];
        expect(corpusStatus([{ rows, total: 2, returned: 2 }]).rows).toHaveLength(2);
    });

    it('trims to the ceiling so a readout never exceeds it', () => {
        const status = corpusStatus([page('a', 10, 999)], 4);

        expect(status.rows).toHaveLength(4);
        expect(status.truncated).toBe(true);
    });

    it('is not truncated when the ceiling happens to equal the whole set', () => {
        // Hitting the cap is only truncation if something is left behind.
        expect(corpusStatus([page('a', 4, 4)], 4).truncated).toBe(false);
    });

    it('takes the total from the first page only', () => {
        // Later pages restate it, and a value that moved mid-walk would make the progress
        // readout jump backwards.
        const pages = [page('a', 2, 4), { ...page('b', 2, 999), total: 999 }];

        expect(corpusStatus(pages).total).toBe(4);
    });

    it('handles no pages at all', () => {
        expect(corpusStatus([])).toEqual({ rows: [], total: 0, truncated: false });
    });

    // Truncation used to require hitting the ceiling, which made every other early stop silent —
    // the screen claimed a complete corpus while holding a fraction of the set.
    it('reports truncation whenever the server holds more, ceiling or not', () => {
        const status = corpusStatus([page('a', 100, 7_700, 100)], 1_000);

        expect(status.rows).toHaveLength(100);
        expect(status.truncated).toBe(true);
    });
});

describe('nextCorpusPage', () => {
    it('starts at page 0', () => {
        expect(nextCorpusPage([])).toBe(0);
    });

    it('asks for the next page after a full one', () => {
        expect(nextCorpusPage([page('a', 100, 500, 100)], 1_000, 100)).toBe(1);
    });

    it('stops on a short page even when the total says otherwise', () => {
        // Trusting a stale total here is what would make the walk endless.
        expect(nextCorpusPage([page('a', 2, 99, 2)], 1_000, 100)).toBeUndefined();
    });

    it('stops as soon as the distinct count reaches the total', () => {
        const pages = [page('a', 100, 200, 100), page('b', 100, 200, 100)];

        expect(nextCorpusPage(pages, 1_000, 100)).toBeUndefined();
    });

    it('stops at the ceiling', () => {
        expect(nextCorpusPage([page('a', 100, 10_000, 100)], 100, 100)).toBeUndefined();
    });

    it('keeps walking when a full page was all repeats', () => {
        // The page was full, so the server has more — the distinct count just did not grow.
        const first = page('a', 100, 10_000, 100);
        const repeats: CorpusPage = { rows: first.rows, total: 10_000, returned: 100 };

        expect(nextCorpusPage([first, repeats], 1_000, 100)).toBe(2);
    });

    /**
     * One repeated page is tolerated (above); a run of them is the endless walk.
     *
     * Batch upload stamps a whole batch with one `createdAt`, and `from`/`size` over a non-unique
     * sort key is unstable inside a tie band — so "a full page of rows we already have" is a
     * shape this server really produces.
     */
    it('gives up after a second consecutive page that added nothing', () => {
        const first = page('a', 100, 10_000, 100);
        const repeats: CorpusPage = { rows: first.rows, total: 10_000, returned: 100 };

        expect(nextCorpusPage([first, repeats, repeats], 1_000, 100)).toBeUndefined();
    });

    it('resets the stall count when a page does add something', () => {
        const first = page('a', 100, 10_000, 100);
        const repeats: CorpusPage = { rows: first.rows, total: 10_000, returned: 100 };
        const fresh = page('b', 100, 10_000, 100);

        expect(nextCorpusPage([first, repeats, fresh], 1_000, 100)).toBe(3);
    });

    it('stops at the request ceiling however full the pages look', () => {
        // The backstop. Every other condition reads the response, so a response that always looks
        // like "there is more" defeats it; this one counts requests.
        const pages = Array.from({ length: MAX_CORPUS_PAGES }, (_, i) => page(`p${i}-`, 100, 1_000_000, 100));

        expect(nextCorpusPage(pages, 1_000_000, 100)).toBeUndefined();
    });

    /**
     * The property that matters more than any single condition: the walk ends. Without it,
     * `hasNextPage` never goes false, and the console derives "collecting" from it — which
     * disables both the re-collect button and the new-log probe, so the screen can neither
     * refresh nor notice arrivals.
     */
    it('terminates on a server that always answers with a full page of repeats', () => {
        const stuck = (): CorpusPage => ({
            rows: Array.from({ length: CORPUS_PAGE_SIZE }, (_, i) => row(`dup${i}`)),
            total: 7_700,
            returned: CORPUS_PAGE_SIZE,
        });

        const pages: CorpusPage[] = [];
        let guard = 0;
        while (nextCorpusPage(pages) !== undefined && guard < 100) {
            pages.push(stuck());
            guard += 1;
        }

        expect(guard).toBeLessThan(100);
        expect(pages.length).toBeLessThanOrEqual(MAX_CORPUS_PAGES);
    });

    it('treats a page size of zero as one, closing the only endless path', () => {
        expect(nextCorpusPage([page('a', 0, 0, 0)], 1_000, 0)).toBeUndefined();
    });
});

describe('shipped defaults', () => {
    it('reaches the ceiling in a single round trip', () => {
        // The cap is one page, which is what lets the range default to open: a walk that
        // cannot exceed one request costs the same whether the operator bounded it or not.
        const full = page('a', CORPUS_PAGE_SIZE, 100_000, CORPUS_PAGE_SIZE);

        expect(nextCorpusPage([full])).toBeUndefined();
        expect(corpusStatus([full]).rows).toHaveLength(CORPUS_CAP);
    });

    it('stays inside the Elasticsearch result window', () => {
        // `from = limit * page`; past 10,000 the backend would need a different pagination
        // mode, which is out of scope (ADR-0083).
        const pagesNeeded = Math.ceil(CORPUS_CAP / CORPUS_PAGE_SIZE);
        expect(CORPUS_PAGE_SIZE * pagesNeeded).toBeLessThanOrEqual(10_000);
    });
});
