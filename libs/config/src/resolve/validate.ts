import type { ConfigEntry } from '../types';

/**
 * Whether a value from any lane may be used for this key.
 *
 * Applied to every lane, not just the ones a person can write. A corrupted stored value or a stale
 * server payload fails here and the lane is skipped, so the resolver falls through to the next row
 * instead of handing broken data to a screen.
 *
 * `json` is accepted as-is for now: how deeply a map value should be checked (the channel-sort and
 * pinned-channel maps have four hand-written parsers today) is still open.
 */
export const isValidValue = (entry: ConfigEntry, value: unknown): boolean => {
    if (value === undefined || value === null) return false;
    switch (entry.type) {
        case 'boolean':
            return typeof value === 'boolean';
        case 'string':
            return typeof value === 'string';
        case 'number':
            return typeof value === 'number' && Number.isFinite(value);
        case 'enum':
            return (entry.values ?? []).includes(value);
        case 'json':
            return typeof value === 'object';
        default:
            return false;
    }
};
