import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { act, fireEvent, render, screen } from '@testing-library/react';

import type * as AppRuntime from '@chatic/app-runtime';
import type { DomainChannel, DomainChat, DomainLastChat } from '@chatic/data';

import '../../../../../i18n';

import { ChannelListPanel } from './ChannelListPanel';

/** A fresh repository per test: the freshness queue is kept per repository, as the app keeps one per runtime. */
const current = vi.hoisted(() => ({ repo: { observeLastList: vi.fn(), refreshList: vi.fn() } }));
let repo = current.repo;

vi.mock('@chatic/app-runtime', async importOriginal => {
    const actual = await importOriginal<typeof AppRuntime>();
    return {
        ...actual,
        runtime: {
            ...actual.runtime,
            data: { ...actual.runtime.data, useRuntimeRepositories: () => ({ chat: current.repo }) },
        },
    };
});

const NOW = new Date(2026, 9, 20, 15, 0).getTime();
const MIN = 60_000;

const channel = (id: string, over: Partial<DomainChannel> = {}) =>
    ({ id, name: id, stereo: 'public', updatedAt: NOW - 600 * MIN, ...over }) as DomainChannel;

const chat = (channelId: string, chatNo: number, content: string, at: number, owner = 'Ada') =>
    ({
        id: `${channelId}-${chatNo}`,
        channelId,
        chatNo,
        content,
        createdAt: at,
        owner$: { name: owner },
    }) as DomainChat;

/** Hands the list's one observation its answer, as the cache would. */
let emit: (rows: DomainLastChat[]) => void = () => undefined;

const renderPanel = (channels: DomainChannel[], over: Partial<Parameters<typeof ChannelListPanel>[0]> = {}) => {
    const onSelect = vi.fn();
    const onCreateChannel = vi.fn();
    render(
        <ChannelListPanel
            channels={channels}
            selectedChannelId={null}
            onSelect={onSelect}
            onCreateChannel={onCreateChannel}
            {...over}
        />
    );
    return { onSelect, onCreateChannel };
};

const rows = () => screen.queryAllByRole('listitem').map(row => row.textContent ?? '');

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    current.repo = { observeLastList: vi.fn(), refreshList: vi.fn() };
    repo = current.repo;
    repo.observeLastList.mockImplementation((_ids: string[], callback: typeof emit) => {
        emit = callback;
        return () => undefined;
    });
    repo.refreshList.mockResolvedValue({});
});

afterEach(() => {
    vi.useRealTimers();
});

describe('ChannelListPanel', () => {
    it("lists the place's channels, not its DMs, with each one's last message and time from one observation", () => {
        renderPanel([channel('general'), channel('random'), channel('dm-1', { stereo: 'dm', name: '' })]);
        act(() =>
            emit([
                { channelId: 'general', lastNo: 4, chat: chat('general', 4, 'hello there', NOW - 5 * MIN) },
                { channelId: 'random', lastNo: 0, chat: null },
            ])
        );

        expect(repo.observeLastList).toHaveBeenCalledTimes(1);
        expect(repo.observeLastList.mock.calls[0][0]).toEqual(['general', 'random']);
        const [general, random] = rows();
        expect(general).toContain('general');
        expect(general).toContain('Ada: hello there');
        expect(general).toMatch(/(2|14):55/);
        expect(random).toContain('No messages yet');
        expect(rows()).toHaveLength(2);
    });

    it('orders the channels by their last activity', () => {
        renderPanel([channel('old'), channel('busy'), channel('quiet', { updatedAt: NOW - 30 * MIN })]);
        act(() =>
            emit([
                { channelId: 'old', lastNo: 1, chat: chat('old', 1, 'a', NOW - 300 * MIN) },
                { channelId: 'busy', lastNo: 9, chat: chat('busy', 9, 'b', NOW - MIN) },
            ])
        );

        expect(rows().map(text => /^(busy|quiet|old)/.exec(text)?.[1])).toEqual(['busy', 'quiet', 'old']);
    });

    it('shows no preview from before my current join in a re-joined channel', () => {
        renderPanel([channel('back', { $join: { joinedNo: 10 } as DomainChannel['$join'] })]);
        act(() => emit([{ channelId: 'back', lastNo: 5, chat: chat('back', 5, 'before I left', NOW - MIN) }]));

        expect(rows()[0]).not.toContain('before I left');
        expect(rows()[0]).toContain('No messages yet');
    });

    it('fetches the newest page once for a channel whose record is ahead of the cache', () => {
        renderPanel([channel('ahead', { chatNo: 12 }), channel('current', { chatNo: 3 })]);
        act(() =>
            emit([
                { channelId: 'ahead', lastNo: 8, chat: chat('ahead', 8, 'x', NOW - MIN) },
                { channelId: 'current', lastNo: 3, chat: chat('current', 3, 'y', NOW - MIN) },
            ])
        );
        act(() => emit([{ channelId: 'ahead', lastNo: 8, chat: chat('ahead', 8, 'x', NOW - MIN) }]));

        expect(repo.refreshList).toHaveBeenCalledTimes(1);
        expect(repo.refreshList.mock.calls[0][0]).toMatchObject({ channelId: 'ahead' });
    });

    it('marks unread channels with their count', () => {
        renderPanel([channel('general', { unreadCount: 3 })]);

        expect(screen.getByText('3 unread messages')).toBeTruthy();
    });

    it('opens the channel picked', () => {
        const { onSelect } = renderPanel([channel('general')]);

        fireEvent.click(screen.getByRole('button', { name: /general/ }));

        expect(onSelect).toHaveBeenCalledWith('general');
    });

    it('narrows the list by name, and says so when nothing matches', () => {
        renderPanel([channel('general'), channel('design')]);
        const search = screen.getByRole('searchbox', { name: 'Search channels' });

        fireEvent.change(search, { target: { value: 'DES' } });
        expect(rows()).toHaveLength(1);
        expect(rows()[0]).toContain('design');

        fireEvent.change(search, { target: { value: 'zzz' } });
        expect(rows()).toHaveLength(0);
        expect(screen.getByText('No channels match “zzz”')).toBeTruthy();
    });

    it('fetches stale channels a few at a time on a cold cache', async () => {
        const settle: Array<() => void> = [];
        repo.refreshList.mockImplementation(() => new Promise<void>(resolve => settle.push(resolve)));
        const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
        renderPanel(ids.map(id => channel(id, { chatNo: 5 })));
        act(() => emit(ids.map(id => ({ channelId: id, lastNo: 0, chat: null }))));

        expect(repo.refreshList).toHaveBeenCalledTimes(3);
        await act(async () => settle[0]());
        expect(repo.refreshList).toHaveBeenCalledTimes(4);
    });

    it('keeps the cap and fetches nothing twice when the list is left and reopened mid-drain', async () => {
        const settle: Array<() => void> = [];
        repo.refreshList.mockImplementation(() => new Promise<void>(resolve => settle.push(resolve)));
        const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
        const stale = ids.map(id => channel(id, { chatNo: 5 }));
        const cold = () => emit(ids.map(id => ({ channelId: id, lastNo: 0, chat: null })));
        const first = render(<ChannelListPanel channels={stale} selectedChannelId={null} onSelect={vi.fn()} />);
        act(cold);
        first.unmount();

        render(<ChannelListPanel channels={stale} selectedChannelId={null} onSelect={vi.fn()} />);
        act(cold);
        expect(repo.refreshList).toHaveBeenCalledTimes(3);

        await act(async () => settle.forEach(resolve => resolve()));
        const fetched = repo.refreshList.mock.calls.map(([query]) => (query as { channelId: string }).channelId);
        expect(fetched).toHaveLength(new Set(fetched).size);
    });

    it('fetches again on the next advance after a failed fetch', async () => {
        repo.refreshList.mockRejectedValue(new Error('offline'));
        const { rerender } = render(
            <ChannelListPanel channels={[channel('a', { chatNo: 5 })]} selectedChannelId={null} onSelect={vi.fn()} />
        );
        act(() => emit([{ channelId: 'a', lastNo: 2, chat: null }]));
        await act(async () => undefined);

        rerender(
            <ChannelListPanel channels={[channel('a', { chatNo: 6 })]} selectedChannelId={null} onSelect={vi.fn()} />
        );
        await act(async () => undefined);

        expect(repo.refreshList).toHaveBeenCalledTimes(2);
    });

    it("says nothing about an empty place while the place's channels load", () => {
        renderPanel([], { isLoading: true });

        expect(screen.queryByText('No channels yet')).toBeNull();
        // Only the header's +: the empty state's own button waits until the place is known to be empty.
        expect(screen.getAllByRole('button', { name: 'Create channel' })).toHaveLength(1);
    });

    it('offers no create action where the place cannot take one', () => {
        renderPanel([], { onCreateChannel: undefined });

        expect(screen.getByText('No channels yet')).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Create channel' })).toBeNull();
    });

    it('offers to create a channel when the place has none', () => {
        const { onCreateChannel } = renderPanel([channel('dm-1', { stereo: 'dm', name: '' })]);

        expect(screen.getByText('No channels yet')).toBeTruthy();
        expect(repo.observeLastList).not.toHaveBeenCalled();
        fireEvent.click(screen.getAllByRole('button', { name: 'Create channel' }).at(-1) as HTMLElement);
        expect(onCreateChannel).toHaveBeenCalled();
    });
});
