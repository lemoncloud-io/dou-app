/**
 * `lib/cloud-deployments/listPaging.spec.ts`
 */
import { describe, expect, it, vi } from 'vitest';

import { collectPages, LIST_CAP, type ListPage } from './listPaging';

const PAGE = 500;

const rows = (count: number): number[] => Array.from({ length: count }, (_, index) => index);

describe('collectPages', () => {
    const pager = (pages: ListPage<number>[]) => vi.fn(async (page: number) => pages[page] ?? { list: [] });

    it('stops at the first short page', async () => {
        const fetchPage = pager([{ list: rows(PAGE) }, { list: rows(3) }]);

        const result = await collectPages(fetchPage, PAGE);

        expect(fetchPage).toHaveBeenCalledTimes(2);
        expect(result.list).toHaveLength(PAGE + 3);
        expect(result.truncated).toBe(false);
    });

    it('stops once the reported total is reached, even on a full page', async () => {
        const fetchPage = pager([{ list: rows(PAGE), total: PAGE }]);

        const result = await collectPages(fetchPage, PAGE);

        expect(fetchPage).toHaveBeenCalledTimes(1);
        expect(result.truncated).toBe(false);
    });

    it('measures a short page against the page size it was given', async () => {
        const fetchPage = pager([{ list: rows(100) }, { list: rows(23) }]);

        expect((await collectPages(fetchPage, 100)).list).toHaveLength(123);
        expect(fetchPage).toHaveBeenCalledTimes(2);
    });

    it('stops at the page cap and reports the list as truncated', async () => {
        const fetchPage = vi.fn(async () => ({ list: rows(PAGE), total: 5000 }));

        const result = await collectPages(fetchPage, PAGE);

        expect(fetchPage).toHaveBeenCalledTimes(LIST_CAP / PAGE);
        expect(result.list).toHaveLength(LIST_CAP);
        expect(result.truncated).toBe(true);
    });

    it('is not truncated when the total is exactly the cap', async () => {
        const fetchPage = vi.fn(async () => ({ list: rows(PAGE), total: LIST_CAP }));

        expect((await collectPages(fetchPage, PAGE)).truncated).toBe(false);
    });
});
