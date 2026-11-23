import { isPlaceScopeKey } from '@chatic/shared';

import type { ChannelSortMethod, HomeSectionId, Theme } from './preferenceKeys';

const VALID_CHANNEL_SORTS: readonly ChannelSortMethod[] = ['recent', 'unread'];

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

const HOME_SECTION_IDS: readonly HomeSectionId[] = ['places', 'channels', 'cloudDm'];

export const normalizeHomeSectionsCollapsed = (value: unknown): Partial<Record<HomeSectionId, true>> => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const result: Partial<Record<HomeSectionId, true>> = {};
    for (const [id, collapsed] of Object.entries(value)) {
        if (collapsed === true && HOME_SECTION_IDS.includes(id as HomeSectionId)) result[id as HomeSectionId] = true;
    }
    return result;
};

export const normalizeRecentSearches = (value: unknown): string[] => {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is string => typeof item === 'string');
};

export const normalizeCloudPromoDismissedAt = (value: unknown, now: number = Date.now()): number => {
    const parsed = Number(value);
    if (value == null || value === '' || !Number.isFinite(parsed) || parsed <= 0) return 0;
    return parsed > now ? 0 : parsed;
};

const THEME_VALUES: readonly string[] = ['dark', 'light', 'system'];

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
