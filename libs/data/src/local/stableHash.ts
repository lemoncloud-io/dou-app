/**
 * Returns `options` serialized as sorted-key JSON.
 * Used to build stream keys for the v2 local data sources (same scope + same query = same stream).
 *
 * - Sorts an object's keys before JSON serialization → equality independent of key order
 * - Drops `undefined` fields before sorting (making them equivalent to a missing key)
 * - MVP: the sorted-key JSON itself is the key
 */
export function stableHash(value: unknown): string {
    return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
    if (value === null || value === undefined) return value;
    if (Array.isArray(value)) return value.map(sortKeys);
    if (typeof value === 'object') {
        const sorted: Record<string, unknown> = {};
        for (const key of Object.keys(value as Record<string, unknown>).sort()) {
            const v = (value as Record<string, unknown>)[key];
            if (v !== undefined) {
                sorted[key] = sortKeys(v);
            }
        }
        return sorted;
    }
    return value;
}
