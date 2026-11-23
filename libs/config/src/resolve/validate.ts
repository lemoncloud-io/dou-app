import type { ConfigEntry } from '../types';

export const isValidValue = (entry: ConfigEntry, value: unknown): boolean => {
    if (value === undefined || value === null) return false;
    switch (entry.type) {
        case 'boolean':
            return typeof value === 'boolean';
        case 'string':
            return typeof value === 'string' && (!entry.pattern || entry.pattern.test(value));
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
