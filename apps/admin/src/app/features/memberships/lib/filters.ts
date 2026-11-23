import type { MembershipView } from '@lemoncloud/chatic-backend-api';

export type FilterKey = 'status' | 'productId' | 'platform' | 'userId' | 'isSuper';

export const FILTER_KEYS: FilterKey[] = ['status', 'productId', 'platform', 'userId', 'isSuper'];

export type FilterValues = Partial<Record<FilterKey, string>>;

export interface FilterChip {
    key: FilterKey;
    label: string;
}

const CHIP_LABEL: Record<FilterKey, string> = {
    status: 'Status',
    productId: 'Product',
    platform: 'Platform',
    userId: 'userId',
    isSuper: 'isSuper',
};

export const activeFilters = (values: FilterValues): FilterKey[] => FILTER_KEYS.filter(key => !!values[key]?.trim());

export const toChips = (values: FilterValues): FilterChip[] =>
    activeFilters(values).map(key => ({
        key,
        label: key === 'isSuper' ? 'isSuper=1' : `${CHIP_LABEL[key]} · ${values[key]?.trim()}`,
    }));

export const clearAllPatch = (): Record<string, string> =>
    FILTER_KEYS.reduce<Record<string, string>>((patch, key) => ({ ...patch, [key]: '' }), {});

export const matchesFilters = (row: MembershipView, values: FilterValues): boolean => {
    const has = (value: string | undefined) => !!value?.trim();
    const contains = (field: string | undefined, term: string) =>
        (field ?? '').toLowerCase().includes(term.trim().toLowerCase());

    if (has(values.status) && row.status !== values.status) return false;
    if (has(values.platform) && row.platform !== values.platform) return false;
    if (has(values.userId) && !contains(row.userId, values.userId as string)) return false;
    if (has(values.productId) && !contains(row.productId, values.productId as string)) return false;
    if (values.isSuper === '1' && !row.isSuper) return false;

    return true;
};
