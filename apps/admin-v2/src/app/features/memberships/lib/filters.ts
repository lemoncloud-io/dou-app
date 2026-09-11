/**
 * `lib/memberships/filters.ts`
 * - The filter set as the toolbar sees it: what is active, and what a chip should say.
 *
 * Kept apart from the page so the labels and the clearing rules are testable without rendering.
 */
import type { MembershipView } from '@lemoncloud/chatic-backend-api';
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

/**
 * Whether a row survives the filters, applied in the browser.
 *
 * These axes are sent to the server too, but the relay ignores every one of them on
 * `GET /memberships/0/list`: its transformer only maps a field into the search model when
 * `hasAdmin` is set, and the list route calls it without. So the same values are applied here,
 * over the rows that came back, and the rail says which reach the server and which do not.
 *
 * Ids match on substring — an operator pasting a partial id is searching, not asserting equality.
 * Status and platform match exactly; they come from a fixed set.
 */
export const matchesFilters = (row: MembershipView, values: FilterValues): boolean => {
    const has = (value: string | undefined) => !!value?.trim();
    const contains = (field: string | undefined, term: string) =>
        (field ?? '').toLowerCase().includes(term.trim().toLowerCase());

    if (has(values.status) && row.status !== values.status) return false;
    if (has(values.platform) && row.platform !== values.platform) return false;
    if (has(values.userId) && !contains(row.userId, values.userId as string)) return false;
    if (has(values.productId) && !contains(row.productId, values.productId as string)) return false;
    // The retired flag is a boolean on the wire (`0 | 1`), so only "show me the ones that have it".
    if (values.isSuper === '1' && !row.isSuper) return false;

    return true;
};
