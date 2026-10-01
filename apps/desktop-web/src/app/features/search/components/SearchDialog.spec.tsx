import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import '../../../../i18n';

const search = vi.hoisted(() => ({ isSearching: false, empty: false, scannedCount: 2 as number | null }));
const channel = { id: 'c1', name: 'general' };
const chat = (id: string, ownerId: string, content: string) => ({ id, chatNo: 1, ownerId, content, createdAt: 1 });

vi.mock('../hooks', () => ({
    SEARCH_MAX_CHANNELS: 30,
    useMessageSearch: () => ({
        results: search.empty
            ? []
            : [
                  {
                      channel,
                      matches: [chat('m1', 'ada', 'the deploy plan'), chat('m2', 'bob', 'deploy plan v2')],
                      matchCount: 2,
                  },
              ],
        isSearching: search.isSearching,
        isTruncated: false,
        scannedCount: search.scannedCount,
    }),
}));
vi.mock('../../../shared', async importOriginal => ({
    ...(await importOriginal<object>()),
    useChannelLabels: () => (ch: { name: string }) => ch.name,
    useAuthorNames: () => new Map([['ada', 'Ada']]),
}));

import { useSearchDialogStore } from '../stores';
import { SearchDialog } from './SearchDialog';

const openWith = async (query: string) => {
    render(<SearchDialog channels={[channel] as never} onSelect={vi.fn()} />);
    act(() => useSearchDialogStore.getState().setOpen(true));
    fireEvent.change(await screen.findByRole('combobox'), { target: { value: query } });
};

describe('SearchDialog rows', () => {
    afterEach(() => {
        cleanup();
        act(() => useSearchDialogStore.getState().setOpen(false));
        search.isSearching = false;
        search.empty = false;
        search.scannedCount = 2;
    });

    // Two hits from different people read as the same line twice.
    it('says who sent each match', async () => {
        await openWith('deploy');
        const options = screen.getAllByRole('option').map(option => option.textContent);
        expect(options[1]).toContain('Ada');
        // Not resolved yet: no stand-in name that would flash and then change.
        expect(options[2]).not.toMatch(/bob|Someone/);
    });

    // The previous count stayed up and jumped as the cache filled in.
    it('holds the match count back while a search is running', async () => {
        search.isSearching = true;
        await openWith('deploy');
        expect(screen.getAllByRole('option')[0].textContent).not.toContain('2 matches');
    });
});

describe('SearchDialog empty result', () => {
    const random = { id: 'c2', name: 'random' };
    const onSelect = vi.fn();
    const openEmptyWith = async (query: string) => {
        search.empty = true;
        render(<SearchDialog channels={[channel, random] as never} onSelect={onSelect} />);
        act(() => useSearchDialogStore.getState().setOpen(true));
        fireEvent.change(await screen.findByRole('combobox'), { target: { value: query } });
    };

    afterEach(() => {
        cleanup();
        act(() => useSearchDialogStore.getState().setOpen(false));
        search.empty = false;
        search.scannedCount = 2;
        onSelect.mockReset();
    });

    // A cold start said "Nothing here yet" for every query, with no hint that nothing was loaded.
    it('says the device has nothing loaded yet on a cold start', async () => {
        search.scannedCount = 0;
        await openEmptyWith('deploy');
        expect(screen.getByText(/hasn't loaded any messages yet/)).toBeTruthy();
        // The empty line states the scope; only the dialog's description carries it, not a footer too.
        expect(screen.getAllByText(/Searches this place/)).toHaveLength(1);
    });

    it('says no loaded message matched when there was something to search', async () => {
        await openEmptyWith('deploy');
        expect(screen.getByText('No match in the messages this device has loaded.')).toBeTruthy();
        expect(screen.queryByRole('option')).toBeNull();
    });

    it('offers a channel whose name matches and opens it', async () => {
        search.scannedCount = 0;
        await openEmptyWith('gener');
        const offers = screen.getAllByRole('option');
        expect(offers.map(option => option.getAttribute('aria-label'))).toEqual(['Open #general']);

        fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });
        expect(onSelect).toHaveBeenCalledWith('c1');
        expect(useSearchDialogStore.getState().isOpen).toBe(false);
    });
});
