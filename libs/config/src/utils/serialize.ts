import type { ConfigEntry } from '../types';

/**
 * Values cross a storage boundary as strings, so they are JSON on the way out and back.
 *
 * Decoding is total: anything unreadable comes back as `undefined` and the caller treats the lane
 * as empty. A single bad write must not be able to break a screen — the resolver simply moves to
 * the next row.
 */
export const encodeValue = (value: unknown): string => JSON.stringify(value);

export const decodeValue = (raw: string | null): { has: boolean; value?: unknown } => {
    if (raw === null) return { has: false };
    try {
        return { has: true, value: JSON.parse(raw) as unknown };
    } catch {
        return { has: false };
    }
};

/** The storage key an override lives under. Namespaced so it never collides with product keys. */
export const storageKeyFor = (key: string): string => `@chatic/config.${key}`;

/** Whether this entry keeps its override anywhere at all. */
export const isPersisted = (entry: ConfigEntry): boolean => entry.persist !== 'none';
