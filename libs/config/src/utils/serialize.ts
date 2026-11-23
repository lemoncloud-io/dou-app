import type { ConfigEntry } from '../types';

export const encodeValue = (value: unknown): string => JSON.stringify(value);

export const decodeValue = (raw: string | null): { has: boolean; value?: unknown } => {
    if (raw === null) return { has: false };
    try {
        return { has: true, value: JSON.parse(raw) as unknown };
    } catch {
        return { has: false };
    }
};

export const storageKeyFor = (key: string): string => `@chatic/config.${key}`;

export const isPersisted = (entry: ConfigEntry): boolean => entry.persist !== 'none';
