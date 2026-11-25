import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type * as AppRuntime from '@chatic/runtime-react';

import '../../../../i18n';

const search = vi.hoisted(() => ({
    isSearching: false,
    empty: false,
    scannedCount: 2 as number | null,
    ownMatch: false,
}));
const seenChannels = vi.hoisted(() => ({ list: [] as unknown[][] }));
const channel = { id: 'c1', name: 'general', sid: 's1', $join: { userId: 'me-cloud' } };
const chat = (id: string, ownerId: string, content: string) => ({ id, chatNo: 1, ownerId, content, createdAt: 1 });

vi.mock('../hooks', () => ({
    SEARCH_MAX_CHANNELS: 30,
    useMessageSearch: (_query: string, channels: unknown[]) => {
        seenChannels.list.push(channels);
        return {
            results: search.empty
                ? []
                : [
                      {
                          channel,
                          matches: [
                              chat('m1', 'ada', 'the deploy plan'),
                              chat('m2', search.ownMatch ? 'me-cloud' : 'bob', 'deploy plan v2'),
                          ],
                          matchCount: 2,
                      },
                  ],
            isSearching: search.isSearching,
            isTruncated: false,
            scannedCount: search.scannedCount,
        };
    },
}));
vi.mock('@chatic/runtime-react', async importOriginal => {
    const actual = await importOriginal<typeof AppRuntime>();
    return {
        ...actual,
        runtime: {
            ...actual.runtime,
            session: { ...actual.runtime.session, useSessionIdentity: () => ({ userId: 'me' }) },
        },
    };
});
vi.mock('../../../shared', async importOriginal => ({
    ...(await importOriginal<object>()),
    useChannelLabels: () => (ch: { name: string }) => ch.name,
    useAuthorNames: () => new Map([['ada', 'Ada']]),
}));

import { usePlaceProfilesStore } from '../../../shared/stores/usePlaceProfilesStore';
import { useSearchDialogStore } from '../stores';
import { SearchDialog } from './SearchDialog';

const openWith = async (query: string, props?: { channels?: object[]; currentChannelId?: string }) => {
    render(
        <SearchDialog
            channels={(props?.channels ?? [channel]) as never}
            onSelect={vi.fn()}
            currentChannelId={props?.currentChannelId}
        />
    );
    act(() => useSearchDialogStore.getState().setOpen(true));
    fireEvent.change(await screen.findByRole('combobox'), { target: { value: query } });
};

const lastSearchedChannels = () => seenChannels.list[seenChannels.list.length - 1] as { id: string }[];

describe('SearchDialog rows', () => {
    afterEach(() => {
        cleanup();
        act(() => useSearchDialogStore.getState().setOpen(false));
        search.isSearching = false;
        search.empty = false;
        search.scannedCount = 2;
        search.ownMatch = false;
        seenChannels.list = [];
        act(() => usePlaceProfilesStore.setState({ bySid: {} }));
    });

    it('says who sent each match', async () => {
        await openWith('deploy');
        const options = screen.getAllByRole('option').map(option => option.textContent);
        expect(options[1]).toContain('Ada');
        expect(options[2]).not.toMatch(/bob|Someone/);
    });

    it("names a match's sender by their nick in the channel's place", async () => {
        act(() => usePlaceProfilesStore.getState().setPlace('s1', { ada: { nick: 'Ada Nick' } }));
        await openWith('deploy');
        const options = screen.getAllByRole('option').map(option => option.textContent);
        expect(options[1]).toContain('Ada Nick');
    });

    it('names my own match by my nick under either of my ids', async () => {
        act(() => usePlaceProfilesStore.getState().setPlace('s1', { me: { nick: 'My Nick' } }));
        search.ownMatch = true;
        await openWith('deploy');
        const options = screen.getAllByRole('option').map(option => option.textContent);
        expect(options[2]).toContain('My Nick');
    });

    it('holds the match count back while a search is running', async () => {
        search.isSearching = true;
        await openWith('deploy');
        expect(screen.getAllByRole('option')[0].textContent).not.toContain('2 matches');
    });

    it('offers no scope toggle without a current channel', async () => {
        await openWith('deploy');
        expect(screen.queryByRole('group', { name: 'Search scope' })).toBeNull();
        expect(lastSearchedChannels().map(c => c.id)).toEqual(['c1']);
    });
});

describe('SearchDialog scope', () => {
    const random = { id: 'c2', name: 'random' };

    afterEach(() => {
        cleanup();
        act(() => useSearchDialogStore.getState().setOpen(false));
        seenChannels.list = [];
    });

    it('narrows the search to the open channel', async () => {
        await openWith('deploy', { channels: [channel, random], currentChannelId: 'c1' });
        fireEvent.click(screen.getByRole('button', { name: 'This channel' }));

        expect(lastSearchedChannels().map(c => c.id)).toEqual(['c1']);
        expect(screen.getByText(/Searching only this channel/)).toBeTruthy();
    });

    it('hands the search the same narrowed channel list on every render', async () => {
        await openWith('deploy', { channels: [channel, random], currentChannelId: 'c1' });
        fireEvent.click(screen.getByRole('button', { name: 'This channel' }));
        const narrowed = lastSearchedChannels();
        fireEvent.change(screen.getByRole('combobox'), { target: { value: 'deploy plan' } });

        expect(lastSearchedChannels()).toBe(narrowed);
    });

    it('stays place-wide when the open channel is not one of the searched ones', async () => {
        await openWith('deploy', { channels: [channel, random], currentChannelId: 'elsewhere' });

        expect(screen.queryByRole('group', { name: 'Search scope' })).toBeNull();
        expect(lastSearchedChannels().map(c => c.id)).toEqual(['c1', 'c2']);
    });

    it('resets the scope when the dialog reopens', async () => {
        const rendered = render(
            <SearchDialog channels={[channel, random] as never} onSelect={vi.fn()} currentChannelId="c1" />
        );
        act(() => useSearchDialogStore.getState().setOpen(true));
        fireEvent.click(screen.getByRole('button', { name: 'This channel' }));
        expect(lastSearchedChannels().map(c => c.id)).toEqual(['c1']);

        act(() => useSearchDialogStore.getState().setOpen(false));
        act(() => useSearchDialogStore.getState().setOpen(true));

        expect(lastSearchedChannels().map(c => c.id)).toEqual(['c1', 'c2']);
        rendered.unmount();
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

    it('says the device has nothing loaded yet on a cold start', async () => {
        search.scannedCount = 0;
        await openEmptyWith('deploy');
        expect(screen.getByText(/hasn't loaded any messages yet/)).toBeTruthy();
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
