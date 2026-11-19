import { runtime } from '@chatic/runtime';
import { normalizeRecentSearches } from '../../../stores/preferenceParsers';
import { MAX_RECENT_SEARCHES } from '../../../stores/preferenceKeys';

const current = (): string[] => normalizeRecentSearches(runtime.settings.get('ui.recentSearches'));

/** Adds a keyword to the front (case-insensitively deduped against the existing list), capped list. */
const addRecentSearch = (keyword: string): void => {
    const trimmed = keyword.trim();
    if (!trimmed) return;
    const withoutDuplicate = current().filter(existing => existing.toLowerCase() !== trimmed.toLowerCase());
    const next = [trimmed, ...withoutDuplicate].slice(0, MAX_RECENT_SEARCHES);
    runtime.settings.set('ui.recentSearches', next, { lane: 'local' });
};

const removeRecentSearch = (keyword: string): void => {
    runtime.settings.set(
        'ui.recentSearches',
        current().filter(existing => existing !== keyword),
        { lane: 'local' }
    );
};

const clearRecentSearches = (): void => {
    runtime.settings.set('ui.recentSearches', [], { lane: 'local' });
};

export const useRecentSearches = () => {
    const raw = runtime.settings.useConfigValue<string[]>('ui.recentSearches');
    return {
        recentSearches: normalizeRecentSearches(raw ?? []),
        addRecentSearch,
        removeRecentSearch,
        clearRecentSearches,
    };
};
