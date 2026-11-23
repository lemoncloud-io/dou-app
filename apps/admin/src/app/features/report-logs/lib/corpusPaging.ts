import type { ReportLogRow } from './parseReportLog';

export const CORPUS_PAGE_SIZE = 500;

export const CORPUS_CAP = 500;

export const MAX_CORPUS_PAGES = 8;

const STALLED_PAGE_LIMIT = 2;

export interface CorpusPage {
    rows: ReportLogRow[];
    total: number;
    returned: number;
}

export interface CorpusStatus {
    rows: ReportLogRow[];
    total: number;
    truncated: boolean;
}

export const corpusStatus = (pages: CorpusPage[], cap = CORPUS_CAP): CorpusStatus => {
    const seen = new Set<string>();
    const rows: ReportLogRow[] = [];
    for (const page of pages) {
        for (const row of page.rows) {
            if (rows.length >= cap) break;
            if (row.id) {
                if (seen.has(row.id)) continue;
                seen.add(row.id);
            }
            rows.push(row);
        }
    }
    const total = pages[0]?.total ?? 0;
    return { rows, total, truncated: total > rows.length };
};

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
