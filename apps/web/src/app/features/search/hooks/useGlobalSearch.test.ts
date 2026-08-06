import { act, renderHook, waitFor } from '@testing-library/react';

import { useGlobalCacheSearch } from '@chatic/app-runtime';
import { useCloudSessionCatalog } from '@chatic/web-core';
import { logger } from '@chatic/bridges';

import { useInvitedClouds } from '../../home/hooks/useInvitedClouds';
import { useGlobalSearch } from './useGlobalSearch';

jest.mock('@chatic/app-runtime', () => ({ useGlobalCacheSearch: jest.fn() }));
jest.mock('@chatic/web-core', () => ({ useCloudSessionCatalog: jest.fn() }));
jest.mock('@chatic/bridges', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock('../../home/hooks/useInvitedClouds', () => ({ useInvitedClouds: jest.fn() }));

const search = jest.fn();

beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    search.mockResolvedValue({ channels: [], sites: [], chats: [] });
    (useGlobalCacheSearch as jest.Mock).mockReturnValue({ search });
    (useCloudSessionCatalog as jest.Mock).mockReturnValue({ clouds: [] });
    (useInvitedClouds as jest.Mock).mockReturnValue({ invitedClouds: [], hasInvitedClouds: false });
});

afterEach(() => {
    jest.useRealTimers();
});

describe('useGlobalSearch', () => {
    it('does not call the search source for a query shorter than 2 characters', async () => {
        renderHook(() => useGlobalSearch('l'));
        act(() => jest.advanceTimersByTime(300));

        expect(search).not.toHaveBeenCalled();
    });

    it('flags a 1-character query as too short without treating an empty query as too short', () => {
        const { result: shortResult } = renderHook(() => useGlobalSearch('l'));
        act(() => jest.advanceTimersByTime(300));
        expect(shortResult.current.isQueryTooShort).toBe(true);

        const { result: emptyResult } = renderHook(() => useGlobalSearch(''));
        act(() => jest.advanceTimersByTime(300));
        expect(emptyResult.current.isQueryTooShort).toBe(false);
    });

    it('debounces the search call by 300ms', async () => {
        // Starts empty (as the real search input does on mount) so the initial debounced value
        // is genuinely below the trigger threshold — useDebounce seeds its state from the first
        // render's value, so starting non-empty would fire immediately and not exercise the delay.
        const { rerender } = renderHook(({ query }) => useGlobalSearch(query), { initialProps: { query: '' } });

        rerender({ query: 'le' });
        act(() => jest.advanceTimersByTime(100));
        rerender({ query: 'lem' });
        act(() => jest.advanceTimersByTime(100));
        rerender({ query: 'lemon' });

        expect(search).not.toHaveBeenCalled();

        act(() => jest.advanceTimersByTime(300));
        await waitFor(() => expect(search).toHaveBeenCalledTimes(1));
        expect(search).toHaveBeenCalledWith('lemon');
    });

    it('assembles results from the cache search source, capped per section', async () => {
        search.mockResolvedValue({
            channels: Array.from({ length: 25 }, (_, i) => ({ id: `ch-${i}`, name: `Channel ${i}` })),
            sites: [{ id: 'site-1', name: 'Lemon HQ' }],
            chats: Array.from({ length: 35 }, (_, i) => ({ id: `chat-${i}`, content: `msg ${i}` })),
        });

        const { result } = renderHook(() => useGlobalSearch('lemon'));
        act(() => jest.advanceTimersByTime(300));

        await waitFor(() => expect(result.current.isSearching).toBe(false));

        expect(result.current.results.channels).toHaveLength(20);
        expect(result.current.results.messages).toHaveLength(30);
        expect(result.current.results.places).toHaveLength(1);
        expect(result.current.hasResults).toBe(true);
    });

    it('matches cloud names case-insensitively from the catalog + invited caches, without calling the cache search source for them', async () => {
        (useCloudSessionCatalog as jest.Mock).mockReturnValue({
            clouds: [{ id: 'c1', cid: 'c1', name: 'Lemon Cloud' }],
        });
        (useInvitedClouds as jest.Mock).mockReturnValue({
            invitedClouds: [{ id: 'c2', cid: 'c2', name: 'Other' }],
            hasInvitedClouds: true,
        });

        const { result } = renderHook(() => useGlobalSearch('LEMON'));
        act(() => jest.advanceTimersByTime(300));
        await waitFor(() => expect(result.current.isSearching).toBe(false));

        expect(result.current.results.clouds.map(c => c.id)).toEqual(['c1']);
    });

    it('searches once even when the cloud sources hand back a new array identity on every render', async () => {
        // Both real hooks rebuild their array each render (useInvitedClouds filters, and
        // useCloudSessionCatalog falls back to a fresh `[]`), which previously re-ran the search
        // effect on every render — an endless search/setState loop that flickered the results.
        (useCloudSessionCatalog as jest.Mock).mockImplementation(() => ({
            clouds: [{ id: 'c1', cid: 'c1', name: 'Lemon Cloud' }],
        }));
        (useInvitedClouds as jest.Mock).mockImplementation(() => ({
            invitedClouds: [{ id: 'c2', cid: 'c2', name: 'Other' }],
            hasInvitedClouds: true,
        }));
        search.mockResolvedValue({ channels: [{ id: 'ch-1', name: 'Lemon' }], sites: [], chats: [] });

        const { result } = renderHook(() => useGlobalSearch('lemon'));
        act(() => jest.advanceTimersByTime(300));
        await waitFor(() => expect(result.current.isSearching).toBe(false));

        // Let any queued re-render settle: a looping effect would keep firing new searches here.
        await act(async () => {
            jest.advanceTimersByTime(1000);
        });

        expect(search).toHaveBeenCalledTimes(1);
        expect(result.current.results.clouds.map(c => c.id)).toEqual(['c1']);
        expect(result.current.results.channels).toHaveLength(1);
    });

    it('clears results once the query drops back below the minimum length', async () => {
        search.mockResolvedValue({
            channels: [{ id: 'ch-1', name: 'Lemon' }],
            sites: [],
            chats: [],
        });

        const { result, rerender } = renderHook(({ query }) => useGlobalSearch(query), {
            initialProps: { query: 'lemon' },
        });
        act(() => jest.advanceTimersByTime(300));
        await waitFor(() => expect(result.current.hasResults).toBe(true));

        rerender({ query: 'l' });
        act(() => jest.advanceTimersByTime(300));

        expect(result.current.hasResults).toBe(false);
        expect(result.current.results).toEqual({ clouds: [], places: [], channels: [], messages: [] });
    });

    it('falls back to cloud-name-only results and logs when the cache search source rejects (e.g. a native bridge failure)', async () => {
        (useCloudSessionCatalog as jest.Mock).mockReturnValue({
            clouds: [{ id: 'c1', cid: 'c1', name: 'Lemon Cloud' }],
        });
        search.mockRejectedValue(new Error('bridge timeout'));

        const { result } = renderHook(() => useGlobalSearch('lemon'));
        act(() => jest.advanceTimersByTime(300));

        await waitFor(() => expect(result.current.isSearching).toBe(false));

        expect(result.current.results).toEqual({
            clouds: [{ id: 'c1', name: 'Lemon Cloud' }],
            places: [],
            channels: [],
            messages: [],
        });
        expect(logger.error).toHaveBeenCalled();
    });
});
