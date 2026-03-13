import { useLocalStorage } from '@chatic/shared';

const STORAGE_KEY = 'chatic:recent-searches';
const MAX_ITEMS = 10;

export const useRecentSearches = () => {
    const [searches, setSearches] = useLocalStorage<string[]>(STORAGE_KEY, []);

    const addSearch = (query: string) => {
        const trimmed = query.trim();
        if (!trimmed) return;

        const filtered = searches.filter(s => s !== trimmed);
        const updated = [trimmed, ...filtered].slice(0, MAX_ITEMS);
        setSearches(updated);
    };

    const removeSearch = (query: string) => {
        setSearches(searches.filter(s => s !== query));
    };

    const clearAll = () => {
        setSearches([]);
    };

    return {
        searches,
        addSearch,
        removeSearch,
        clearAll,
    };
};
