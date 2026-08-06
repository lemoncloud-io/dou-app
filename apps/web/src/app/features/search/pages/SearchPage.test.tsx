import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { useGlobalSearch } from '../hooks/useGlobalSearch';
import { useSearchContext } from '../hooks/useSearchContext';
import { useRecentSearches } from '../hooks/useRecentSearches';
import { useSearchNavigate } from '../hooks/useSearchNavigate';
import { SearchPage } from './SearchPage';

jest.mock('../hooks/useGlobalSearch', () => ({ useGlobalSearch: jest.fn() }));
jest.mock('../hooks/useSearchContext', () => ({ useSearchContext: jest.fn() }));
jest.mock('../hooks/useRecentSearches', () => ({ useRecentSearches: jest.fn() }));
jest.mock('../hooks/useSearchNavigate', () => ({ useSearchNavigate: jest.fn() }));
jest.mock('@chatic/shared', () => ({ useNavigateWithTransition: () => jest.fn() }));
jest.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (_key: string, fallback: string) => fallback, i18n: { language: 'ko' } }),
}));

const EMPTY_ROWS = { clouds: [], places: [], channels: [], chats: [] };

const setSearchState = (overrides: Record<string, unknown> = {}) =>
    (useGlobalSearch as jest.Mock).mockReturnValue({
        results: { clouds: [], places: [], channels: [], messages: [] },
        isSearching: false,
        hasResults: false,
        isQueryTooShort: false,
        ...overrides,
    });

const renderAt = (path: string) =>
    render(
        <MemoryRouter initialEntries={[path]}>
            <SearchPage />
        </MemoryRouter>
    );

beforeEach(() => {
    jest.clearAllMocks();
    setSearchState();
    (useSearchContext as jest.Mock).mockReturnValue(EMPTY_ROWS);
    (useRecentSearches as jest.Mock).mockReturnValue({
        recentSearches: [],
        addRecentSearch: jest.fn(),
        removeRecentSearch: jest.fn(),
        clearRecentSearches: jest.fn(),
    });
    (useSearchNavigate as jest.Mock).mockReturnValue({ goTo: jest.fn() });
});

describe('SearchPage', () => {
    it('restores the keyword from the URL so returning from a result shows that search again', () => {
        setSearchState({ hasResults: true });
        (useSearchContext as jest.Mock).mockReturnValue({
            ...EMPTY_ROWS,
            places: [{ cid: 'c1', placeId: 'p1', name: 'Lemon HQ' }],
        });

        renderAt('/search?q=lemon');

        expect(screen.getByDisplayValue('lemon')).toBeTruthy();
        // HighlightText splits the matched part into its own element, so assert on the row itself.
        expect(screen.getByRole('button', { name: 'Lemon HQ' })).toBeTruthy();
        // The search hook must see the restored keyword, not an empty box.
        expect(useGlobalSearch).toHaveBeenCalledWith('lemon');
    });

    it('shows recent searches when the URL carries no keyword', () => {
        (useRecentSearches as jest.Mock).mockReturnValue({
            recentSearches: ['lemon'],
            addRecentSearch: jest.fn(),
            removeRecentSearch: jest.fn(),
            clearRecentSearches: jest.fn(),
        });

        renderAt('/search');

        expect(useGlobalSearch).toHaveBeenCalledWith('');
        expect(screen.getByText('lemon')).toBeTruthy();
    });

    it('shows a loading state while scanning, not an empty page', () => {
        setSearchState({ isSearching: true, hasResults: false });

        renderAt('/search?q=lemon');

        expect(screen.getByRole('status')).toBeTruthy();
        expect(screen.queryByText('검색 결과가 없습니다.')).toBeNull();
    });

    it('says there are no results only once the scan is done', () => {
        setSearchState({ isSearching: false, hasResults: false });

        renderAt('/search?q=lemon');

        expect(screen.getByText('검색 결과가 없습니다.')).toBeTruthy();
        expect(screen.queryByRole('status')).toBeNull();
    });
});
