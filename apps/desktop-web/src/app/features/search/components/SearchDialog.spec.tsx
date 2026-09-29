import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import '../../../../i18n';

const search = vi.hoisted(() => ({ isSearching: false }));
const channel = { id: 'c1', name: 'general' };
const chat = (id: string, ownerId: string, content: string) => ({ id, chatNo: 1, ownerId, content, createdAt: 1 });

vi.mock('../hooks', () => ({
    SEARCH_MAX_CHANNELS: 30,
    useMessageSearch: () => ({
        results: [
            {
                channel,
                matches: [chat('m1', 'ada', 'the deploy plan'), chat('m2', 'bob', 'deploy plan v2')],
                matchCount: 2,
            },
        ],
        isSearching: search.isSearching,
        isTruncated: false,
    }),
}));
vi.mock('../../../shared', async importOriginal => ({
    ...(await importOriginal<object>()),
    useChannelLabels: () => () => 'general',
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
