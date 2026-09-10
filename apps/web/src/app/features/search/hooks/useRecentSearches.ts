import { config } from '@chatic/config';
import { useConfigValue } from '@chatic/config/react';
import { normalizeRecentSearches } from '../../../stores/preferenceParsers';
import { MAX_RECENT_SEARCHES } from '../../../stores/preferenceKeys';

const current = (): string[] => normalizeRecentSearches(config.get('ui.recentSearches'));

/** Adds a keyword to the front (case-insensitively deduped against the existing list), capped list. */
const addRecentSearch = (keyword: string): void => {
    const trimmed = keyword.trim();
    if (!trimmed) return;
    const withoutDuplicate = current().filter(existing => existing.toLowerCase() !== trimmed.toLowerCase());
    const next = [trimmed, ...withoutDuplicate].slice(0, MAX_RECENT_SEARCHES);
    config.set('ui.recentSearches', next, { lane: 'local' });
};

const removeRecentSearch = (keyword: string): void => {
    config.set(
        'ui.recentSearches',
        current().filter(existing => existing !== keyword),
        { lane: 'local' }
    );
};

const clearRecentSearches = (): void => {
    config.set('ui.recentSearches', [], { lane: 'local' });
};

export const useRecentSearches = () => {
    const raw = useConfigValue<string[]>('ui.recentSearches');
    return {
        recentSearches: normalizeRecentSearches(raw ?? []),
        addRecentSearch,
        removeRecentSearch,
        clearRecentSearches,
    };
};
