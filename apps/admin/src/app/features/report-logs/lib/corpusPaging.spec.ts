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
        expect(corpusStatus([page('a', 4, 4)], 4).truncated).toBe(false);
    });

    it('takes the total from the first page only', () => {
        const pages = [page('a', 2, 4), { ...page('b', 2, 999), total: 999 }];

        expect(corpusStatus(pages).total).toBe(4);
    });

    it('handles no pages at all', () => {
        expect(corpusStatus([])).toEqual({ rows: [], total: 0, truncated: false });
    });

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
        const first = page('a', 100, 10_000, 100);
        const repeats: CorpusPage = { rows: first.rows, total: 10_000, returned: 100 };

        expect(nextCorpusPage([first, repeats], 1_000, 100)).toBe(2);
    });

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
        const pages = Array.from({ length: MAX_CORPUS_PAGES }, (_, i) => page(`p${i}-`, 100, 1_000_000, 100));

        expect(nextCorpusPage(pages, 1_000_000, 100)).toBeUndefined();
    });

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
        const full = page('a', CORPUS_PAGE_SIZE, 100_000, CORPUS_PAGE_SIZE);

        expect(nextCorpusPage([full])).toBeUndefined();
        expect(corpusStatus([full]).rows).toHaveLength(CORPUS_CAP);
    });

    it('stays inside the Elasticsearch result window', () => {
        const pagesNeeded = Math.ceil(CORPUS_CAP / CORPUS_PAGE_SIZE);
        expect(CORPUS_PAGE_SIZE * pagesNeeded).toBeLessThanOrEqual(10_000);
    });
});
