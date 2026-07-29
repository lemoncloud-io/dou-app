import { usePreferenceStore } from '../../../stores/usePreferenceStore';

export const useRecentSearches = () => {
    const recentSearches = usePreferenceStore(s => s.recentSearches);
    const addRecentSearch = usePreferenceStore(s => s.addRecentSearch);
    const removeRecentSearch = usePreferenceStore(s => s.removeRecentSearch);
    const clearRecentSearches = usePreferenceStore(s => s.clearRecentSearches);

    return { recentSearches, addRecentSearch, removeRecentSearch, clearRecentSearches };
};
