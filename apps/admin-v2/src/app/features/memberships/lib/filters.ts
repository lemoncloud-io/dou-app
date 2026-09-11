/**
 * `lib/memberships/filters.ts`
 * - The filter set as the toolbar sees it: what is active, and what a chip should say.
 *
 * Kept apart from the page so the labels and the clearing rules are testable without rendering.
 */
import type { MembershipListParams } from '../api/membershipsQuery';

/** The filter keys the toolbar drives. `page`/`limit` are pagination, not filters. */
export type FilterKey = 'status' | 'productId' | 'platform' | 'userId' | 'isSuper';

export const FILTER_KEYS: FilterKey[] = ['status', 'productId', 'platform', 'userId', 'isSuper'];

export type FilterValues = Partial<Record<FilterKey, string>>;

export interface FilterChip {
    key: FilterKey;
    /** What the operator sees, e.g. `상태 · expired`. */
    label: string;
}

const CHIP_LABEL: Record<FilterKey, string> = {
    status: '상태',
    productId: '상품',
    platform: '플랫폼',
    userId: 'userId',
    isSuper: 'isSuper',
};

/** Only non-empty filters count — an empty string is "no filter", not a filter for "". */
export const activeFilters = (values: FilterValues): FilterKey[] => FILTER_KEYS.filter(key => !!values[key]?.trim());

export const toChips = (values: FilterValues): FilterChip[] =>
    activeFilters(values).map(key => ({
        key,
        // `isSuper` is a flag, so its value adds nothing a reader needs.
        label: key === 'isSuper' ? 'isSuper=1' : `${CHIP_LABEL[key]} · ${values[key]?.trim()}`,
    }));

/** The patch that clears everything the toolbar owns. Pagination resets with it. */
export const clearAllPatch = (): Record<string, string> =>
    FILTER_KEYS.reduce<Record<string, string>>((patch, key) => ({ ...patch, [key]: '' }), {});

/**
 * Status distribution for the rows on screen.
 *
 * The membership list endpoint returns no aggregation (unlike the cloud list), so this counts what
 * came back. It describes the current page, never the whole result — the caller has to say so.
 */
export const countByStatus = (rows: Array<{ status?: string }>): Array<[string, number]> => {
    const counts = rows.reduce<Record<string, number>>((acc, row) => {
        const key = row.status || 'unknown';
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
    }, {});

    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
};

export const asListParams = (values: FilterValues, page: number, limit: number): MembershipListParams => ({
    page,
    limit,
    status: values.status,
    productId: values.productId,
    platform: values.platform,
    userId: values.userId,
    isSuper: values.isSuper,
});
