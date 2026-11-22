/**
 * The filter and sort the Storage and DB screens share — picked from controls, not typed as a query:
 *
 * - `text`: the record's JSON contains it (case-insensitive) — a word from anywhere in the record.
 * - `field` + `value`: that one field contains `value` (case-insensitive). No field, or an empty value,
 *   filters nothing, so picking a field before typing does not empty the list.
 * - `sortField` + `descending`: the order; the records' own order when no field is picked.
 *
 * Values are compared as the JSON text of whatever is there, so a number or a boolean matches what
 * the row shows when expanded.
 */

/** Any plain object: a cache row, a storage key's record. */
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

/** A value as the text a filter compares against: strings as they are, everything else as JSON. */
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

/** Numbers numerically (numeric strings included), everything else by locale with numeric collation. */
const compareValues = (a: unknown, b: unknown): number => {
    const an = asNumber(a);
    const bn = asNumber(b);
    if (an !== null && bn !== null) return an - bn;
    return asText(a).localeCompare(asText(b), undefined, { numeric: true });
};

/** Whether `record` passes the text and field filters. */
export const matchesFilter = (record: DataRecord, filter: RecordFilter): boolean => {
    const text = filter.text.trim().toLowerCase();
    if (text && !asText(record).toLowerCase().includes(text)) return false;
    const value = filter.value.trim().toLowerCase();
    if (filter.field && value && !asText(fieldOf(record, filter.field)).toLowerCase().includes(value)) return false;
    return true;
};

/**
 * Filters, then orders when a sort field is picked. Records without the field stay last in both
 * directions, so a sort never buries the rows that have it. Never mutates `records`.
 */
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

/** The top-level field names across `records`, sorted — the screens offer them in the field pickers. */
export const fieldNamesOf = (records: readonly DataRecord[], limit = 200): string[] => {
    const names = new Set<string>();
    for (const record of records.slice(0, limit)) for (const key of Object.keys(record)) names.add(key);
    return [...names].sort();
};
