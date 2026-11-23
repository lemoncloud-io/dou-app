export type DataRecord = object;

export interface RecordFilter {
    text: string;
    field: string;
    value: string;
    sortField: string;
    descending: boolean;
}

export const EMPTY_FILTER: RecordFilter = { text: '', field: '', value: '', sortField: '', descending: false };

const fieldOf = (record: DataRecord, field: string): unknown => (record as Record<string, unknown>)[field];

const asText = (value: unknown): string => {
    if (value === undefined || value === null) return '';
    if (typeof value === 'string') return value;
    try {
        return JSON.stringify(value) ?? '';
    } catch {
        return String(value);
    }
};

const asNumber = (value: unknown): number | null => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string' && value.trim() !== '') {
        const n = Number(value);
        return Number.isFinite(n) ? n : null;
    }
    return null;
};

const isMissing = (value: unknown): boolean => value === undefined || value === null || value === '';

const compareValues = (a: unknown, b: unknown): number => {
    const an = asNumber(a);
    const bn = asNumber(b);
    if (an !== null && bn !== null) return an - bn;
    return asText(a).localeCompare(asText(b), undefined, { numeric: true });
};

export const matchesFilter = (record: DataRecord, filter: RecordFilter): boolean => {
    const text = filter.text.trim().toLowerCase();
    if (text && !asText(record).toLowerCase().includes(text)) return false;
    const value = filter.value.trim().toLowerCase();
    if (filter.field && value && !asText(fieldOf(record, filter.field)).toLowerCase().includes(value)) return false;
    return true;
};

export const applyFilter = <T extends DataRecord>(records: readonly T[], filter: RecordFilter): T[] => {
    const filtered = records.filter(record => matchesFilter(record, filter));
    const { sortField, descending } = filter;
    if (!sortField) return filtered;
    return filtered.sort((a, b) => {
        const av = fieldOf(a, sortField);
        const bv = fieldOf(b, sortField);
        if (isMissing(av) || isMissing(bv)) return isMissing(av) === isMissing(bv) ? 0 : isMissing(av) ? 1 : -1;
        const order = compareValues(av, bv);
        return descending ? -order : order;
    });
};

export const fieldNamesOf = (records: readonly DataRecord[], limit = 200): string[] => {
    const names = new Set<string>();
    for (const record of records.slice(0, limit)) for (const key of Object.keys(record)) names.add(key);
    return [...names].sort();
};
