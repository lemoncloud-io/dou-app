import { fireEvent, render, screen } from '@testing-library/react';
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
        // No resource bundle in this unit test, so `t` just echoes what it was called with — a
        // plain key by itself, or the key plus its interpolation values when there are any.
        t: (key: string, options?: Record<string, unknown>) => (options ? `${key}|${JSON.stringify(options)}` : key),
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

        expect(screen.getByText('search.scopeNoticeNamed|{"cloud":"Lemon Cloud"}')).toBeTruthy();
    });

    it('falls back to a generic scope notice before the cloud name is known', () => {
        setSearchState({ activeCloudName: undefined });

        renderAt('/search?q=lemon');

        expect(screen.getByText('search.scopeNotice')).toBeTruthy();
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
        expect(screen.queryByText('search.noResults')).toBeNull();
    });

    it('says there are no results only once the scan is done', () => {
        setSearchState({ isSearching: false, hasResults: false });

        renderAt('/search?q=lemon');

        expect(screen.getByText('search.noResults')).toBeTruthy();
        expect(screen.queryByRole('status')).toBeNull();
    });

    describe('opening a message result', () => {
        const chatRow = (overrides: Record<string, unknown> = {}) => ({
            cid: 'c1',
            sid: 's1',
            chatId: 'ch1:9',
            channelId: 'ch1',
            chatNo: 9,
            content: 'lemon tart',
            ...overrides,
        });

        const openResult = (row: ReturnType<typeof chatRow>) => {
            const goTo = jest.fn();
            (useSearchNavigate as jest.Mock).mockReturnValue({ goTo });
            setSearchState({ hasResults: true });
            (useSearchContext as jest.Mock).mockReturnValue({ ...EMPTY_ROWS, chats: [row] });
            renderAt('/search?q=lemon');
            fireEvent.click(screen.getByText('tart', { exact: false }));
            return goTo;
        };

        it('jumps to a top-level message in its room', () => {
            const goTo = openResult(chatRow());

            expect(goTo).toHaveBeenCalledWith('/channels/ch1/room?chatNo=9', { cid: 'c1', sid: 's1' });
        });

        it('opens a reply straight on its thread, with no room under it, so back returns to search', () => {
            const goTo = openResult(chatRow({ parentId: '3' }));

            expect(goTo).toHaveBeenCalledTimes(1);
            expect(goTo).toHaveBeenCalledWith('/channels/ch1/thread/3?chatNo=9', { cid: 'c1', sid: 's1' });
        });

        it('opens an unsent reply on its thread without a jump', () => {
            const goTo = openResult(chatRow({ chatNo: 0, parentId: 'ch1:3' }));

            expect(goTo).toHaveBeenCalledWith('/channels/ch1/thread/3', { cid: 'c1', sid: 's1' });
        });
    });
});
