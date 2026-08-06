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
    useTranslation: () => ({
        // Mirrors i18next: a string second arg is the fallback, an object carries defaultValue +
        // interpolation values.
        t: (_key: string, second?: string | Record<string, unknown>) => {
            if (typeof second === 'string') return second;
            const { defaultValue = '', ...values } = second ?? {};
            return Object.entries(values).reduce<string>(
                (text, [name, value]) => text.replace(`{{${name}}}`, String(value)),
                String(defaultValue)
            );
        },
        i18n: { language: 'ko' },
    }),
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

    it("shows a place's own photo, and the picture placeholder when it has none", () => {
        setSearchState({ hasResults: true });
        (useSearchContext as jest.Mock).mockReturnValue({
            ...EMPTY_ROWS,
            places: [
                { cid: 'c1', placeId: 'p1', name: 'Lemon HQ', thumbnail: 'data:image/png;base64,AAA' },
                { cid: 'c1', placeId: 'p2', name: 'No Photo' },
            ],
        });

        const { container } = renderAt('/search?q=lemon');

        // The photo renders as an <img>; the placeholder is an inline svg disc (not the person glyph).
        expect(container.querySelectorAll('img')).toHaveLength(1);
        const rows = screen.getAllByRole('button').filter(node => node.textContent?.includes('No Photo'));
        expect(rows[0].querySelector('svg')).toBeTruthy();
    });

    it('names the searched cloud so a missing result does not read as missing data', () => {
        setSearchState({ activeCloudName: 'Lemon Cloud' });

        renderAt('/search?q=lemon');

        expect(screen.getByText("'Lemon Cloud'에서만 검색됩니다")).toBeTruthy();
    });

    it('falls back to a generic scope notice before the cloud name is known', () => {
        setSearchState({ activeCloudName: undefined });

        renderAt('/search?q=lemon');

        expect(screen.getByText('현재 클라우드에서만 검색됩니다')).toBeTruthy();
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
