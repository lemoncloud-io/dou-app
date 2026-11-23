export interface ListPage<T> {
    list?: T[];
    total?: number;
}

export interface PagedList<T> {
    list: T[];
    truncated: boolean;
}

export const LIST_CAP = 2000;

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
