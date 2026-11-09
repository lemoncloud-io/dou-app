/**
 * `lib/cloud-deployments/listPaging.ts`
 * - Where a list walk stops: the goods product lists and the relay's cloud list page the same way.
 */

/** One page as the list endpoints return it. */
export interface ListPage<T> {
    list?: T[];
    total?: number;
}

export interface PagedList<T> {
    list: T[];
    /** The walk hit {@link LIST_CAP} with more left — the screen has to say so. */
    truncated: boolean;
}

/**
 * The deepest the goods service pages. Past `page × limit = 2000` it quietly clamps `page` and hands
 * back a page it already sent — no error — so a walk stops here instead of collecting repeats. The
 * relay's cloud list is far smaller and never reaches it; there the cap is only a guard.
 */
export const LIST_CAP = 2000;

/**
 * Walks pages from 0 until a short page, the reported total, or the cap — whichever comes first.
 * `pageSize` has to be the `limit` actually sent, or a full page reads as a short one.
 */
export const collectPages = async <T>(
    fetchPage: (page: number) => Promise<ListPage<T>>,
    pageSize: number
): Promise<PagedList<T>> => {
    const list: T[] = [];

    for (let page = 0; ; page++) {
        const response = await fetchPage(page);
        const rows = response.list ?? [];
        list.push(...rows);

        const reachedEnd = rows.length < pageSize || (response.total !== undefined && list.length >= response.total);
        if (reachedEnd) return { list, truncated: false };
        if (list.length >= LIST_CAP) return { list, truncated: true };
    }
};
