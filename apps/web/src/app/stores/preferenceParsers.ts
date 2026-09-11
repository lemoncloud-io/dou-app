import { isPlaceScopeKey } from '@chatic/shared';

import type { ChannelSortMethod, Theme } from './preferenceKeys';

// ---------------------------------------------------------------------------
// Defensive parsers for the `json`-typed `ui.*` config keys.
//
// `@chatic/config` only validates that a `type: 'json'` value is parseable JSON — it has no way to
// know that a "channel sort map" must have `ChannelSortMethod` values, or that a "pinned channels
// map" must have non-empty string arrays. That product-shape validation lives here, applied to
// whatever `config.get()`/`useConfigValue()` returns (already-decoded, so these take the real value,
// not a raw string) and to a raw legacy-storage string during the one-time migration.
// ---------------------------------------------------------------------------

const VALID_CHANNEL_SORTS: readonly ChannelSortMethod[] = ['recent', 'unread'];

/**
 * Keep only recognized per-place values, so a corrupt/tampered entry can't leave the sort picker
 * with no selection or feed an unknown method downstream. Legacy entries keyed by a bare placeId
 * are dropped: they can't be attributed to a cloud, so honoring them would leak one cloud's sort
 * into another's same-id place.
 */
export const normalizeChannelSort = (value: unknown): Record<string, ChannelSortMethod> => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const result: Record<string, ChannelSortMethod> = {};
    for (const [scope, method] of Object.entries(value)) {
        if (isPlaceScopeKey(scope) && VALID_CHANNEL_SORTS.includes(method as ChannelSortMethod)) {
            result[scope] = method as ChannelSortMethod;
        }
    }
    return result;
};

export const parseChannelSort = (raw: string): Record<string, ChannelSortMethod> => {
    try {
        return normalizeChannelSort(JSON.parse(raw));
    } catch {
        return {};
    }
};

// normalizePinnedChannels/parsePinnedChannels moved to @chatic/shared
// (libs/shared/src/preferences/pinnedChannels.ts) — shared with desktop-web.

/**
 * A stored array of ids. Anything else — a corrupt value, a non-array, non-string members —
 * degrades to "nothing recorded" rather than throwing, matching the other parsers here.
 */
export const normalizeInviteIds = (value: unknown): string[] => {
    if (!Array.isArray(value)) return [];
    return value.filter((id): id is string => typeof id === 'string' && id.length > 0);
};

export const parseInviteIds = (raw: string): string[] => {
    try {
        return normalizeInviteIds(JSON.parse(raw));
    } catch {
        return [];
    }
};

/**
 * A corrupt or non-array value resets to an empty list so a single bad write can never break the
 * search page — it just starts with no history. Non-string entries are dropped rather than failing
 * the whole parse.
 */
export const normalizeRecentSearches = (value: unknown): string[] => {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is string => typeof item === 'string');
};

export const parseRecentSearches = (raw: string): string[] => {
    try {
        return normalizeRecentSearches(JSON.parse(raw));
    } catch {
        return [];
    }
};

/**
 * Anything unusable degrades to 0 so the banner SHOWS rather than staying hidden: a corrupt value
 * must not be able to suppress it permanently. A timestamp in the future is treated the same way —
 * it can only come from a clock change or a bad write, and honouring it would hide the banner for as
 * long as that future date is away.
 */
export const normalizeCloudPromoDismissedAt = (value: unknown, now: number = Date.now()): number => {
    const parsed = Number(value);
    if (value == null || value === '' || !Number.isFinite(parsed) || parsed <= 0) return 0;
    return parsed > now ? 0 : parsed;
};

export const parseCloudPromoDismissedAt = (raw: string, now: number = Date.now()): number =>
    normalizeCloudPromoDismissedAt(raw, now);

const THEME_VALUES: readonly string[] = ['dark', 'light', 'system'];

/**
 * Normalize a value coming off the legacy `FetchPreference` bridge (`PreferenceLoader`'s fallback
 * for an app build too old to inject the `@chatic/config` boot envelope) into a valid `Theme`, or
 * null when unrecognized. Two shapes must be accepted: the plain string this app used to write
 * ('dark'), and the zustand-persist JSON envelope the mobile app stores under the same native key
 * (`{"state":{"theme":"dark"},"version":0}`) — a bridge fetch on native returns whichever shape was
 * persisted last.
 */
export const parseThemeBridgeValue = (value: unknown): Theme | null => {
    if (typeof value !== 'string') return null;
    if (THEME_VALUES.includes(value)) return value as Theme;
    try {
        const inner = JSON.parse(value)?.state?.theme;
        return typeof inner === 'string' && THEME_VALUES.includes(inner) ? (inner as Theme) : null;
    } catch {
        return null;
    }
};
