import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import type { DomainChannel } from '@chatic/data';
import { TooltipProvider } from '@chatic/ui-kit/components/ui/tooltip';

import '../../../../../i18n';

import {
    myThreadKey,
    useMentionsStore,
    useMyThreadsStore,
    useNotificationsPanelStore,
    type MentionItem,
} from '../../../../shared';
import { NotificationsPanel } from './NotificationsPanel';

const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter>
        <TooltipProvider>{children}</TooltipProvider>
    </MemoryRouter>
);

const NOW = new Date(2026, 9, 20, 15, 0).getTime();
const HOUR = 3_600_000;

const item = (id: string, over: Partial<MentionItem> = {}): MentionItem => ({
    id,
    channelId: 'C1',
    chatNo: 5,
    content: `${id} body`,
    ownerName: 'Ada',
    placeId: 'P1',
    createdAt: NOW - HOUR,
    ...over,
});

const seed = (...items: MentionItem[]) =>
    useMentionsStore.setState({ items: Object.fromEntries(items.map(entry => [entry.id, entry])) });

const CHANNELS = [{ id: 'C1', name: 'general' }] as DomainChannel[];

const renderPanel = (onSelect = vi.fn()) =>
    render(<NotificationsPanel cloudId="cloud-1" channels={CHANNELS} onSelect={onSelect} />, { wrapper });

/** Watches the panel's 3-second wait among the timers the kit's own components set. */
const lingerTimer = () => {
    const handles: unknown[] = [];
    const set = globalThis.setTimeout;
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void, ms?: number) => {
        const handle = set(fn, ms);
        if (ms === 3000) handles.push(handle);
        return handle;
    }) as typeof setTimeout);
    const clear = vi.spyOn(globalThis, 'clearTimeout');
    return {
        cleared: () => handles.length === 1 && clear.mock.calls.some(([handle]) => handle === handles[0]),
    };
};

const listed = () => screen.queryAllByRole('listitem').map(card => card.textContent ?? '');

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(NOW);
    useMentionsStore.setState({ items: {} });
    useMyThreadsStore.setState({ threads: {} });
    useNotificationsPanelStore.setState({
        openedId: null,
        tab: 'all',
        unreadOnly: false,
        sort: 'newest',
        scanningCid: null,
    });
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
});

describe('NotificationsPanel tabs', () => {
    it('badges each tab with its unread count', () => {
        seed(
            item('mention', { kind: 'direct' }),
            item('dm', { kind: 'dm' }),
            item('reply', { kind: 'reply', parentId: '3' }),
            item('read', { kind: 'direct', readAt: NOW })
        );
        renderPanel();

        expect(within(screen.getByRole('tab', { name: /All/ })).getByText('3')).toBeTruthy();
        expect(within(screen.getByRole('tab', { name: /Mentions/ })).getByText('1')).toBeTruthy();
        expect(within(screen.getByRole('tab', { name: /Threads/ })).getByText('1')).toBeTruthy();
    });

    // A bare number after the label read as "All3"; the count says what it counts.
    it('names what a tab badge counts', () => {
        seed(item('mention', { kind: 'direct' }));
        renderPanel();

        expect(screen.getByRole('tab', { name: /^All\s*, 1 unread$/ })).toBeTruthy();
    });

    it('lists only the chosen tab', () => {
        seed(item('mention', { kind: 'direct' }), item('dm', { kind: 'dm' }));
        renderPanel();

        fireEvent.mouseDown(screen.getByRole('tab', { name: /DM/ }), { button: 0 });

        expect(listed()).toEqual([expect.stringContaining('dm body')]);
    });
});

describe('NotificationsPanel filter and sort', () => {
    it('hides read items while the unread filter is on', () => {
        seed(item('unread'), item('read', { readAt: NOW, createdAt: NOW - 2 * HOUR }));
        renderPanel();

        const filter = screen.getByRole('button', { name: 'Unread' });
        fireEvent.click(filter);

        expect(filter.getAttribute('aria-pressed')).toBe('true');
        expect(listed()).toEqual([expect.stringContaining('unread body')]);
    });

    it('turns the order around from the sort menu', () => {
        seed(item('newer'), item('older', { createdAt: NOW - 2 * HOUR }));
        renderPanel();
        expect(listed()).toEqual([expect.stringContaining('newer'), expect.stringContaining('older')]);

        fireEvent.keyDown(screen.getByRole('button', { name: 'Sort: Newest' }), { key: 'Enter' });
        fireEvent.click(screen.getByRole('menuitemradio', { name: 'Oldest' }));

        expect(listed()).toEqual([expect.stringContaining('older'), expect.stringContaining('newer')]);
        expect(screen.getByRole('button', { name: 'Sort: Oldest' })).toBeTruthy();
    });

    it('heads each day of items with its date', () => {
        seed(item('today'), item('yesterday', { createdAt: NOW - 24 * HOUR }));
        renderPanel();

        expect(screen.getByRole('heading', { name: 'Today' })).toBeTruthy();
        expect(screen.getByRole('heading', { name: 'Yesterday' })).toBeTruthy();
    });
});

describe('NotificationsPanel cards', () => {
    it('says what happened and where', () => {
        // A channel of another place: not loaded, so named by what was kept with the item.
        seed(item('reply', { kind: 'reply', parentId: '3', channelId: 'C9', channelName: 'design' }));
        renderPanel();

        const card = screen.getByRole('listitem');
        expect(within(card).getByText('Thread')).toBeTruthy();
        expect(within(card).getByText('# design')).toBeTruthy();
        expect(within(card).getByText('Replied to your message')).toBeTruthy();
    });

    it('quotes the thread a reply answers, when this device has it', () => {
        useMyThreadsStore.setState({
            threads: {
                [myThreadKey('cloud-1', 'C1', '3')]: {
                    cid: 'cloud-1',
                    channelId: 'C1',
                    rootNo: '3',
                    rootPreview: 'the plan for Friday',
                } as never,
            },
        });
        seed(item('reply', { kind: 'reply', parentId: '3' }));
        renderPanel();

        expect(screen.getByText(/the plan for Friday/)).toBeTruthy();
    });

    it('names a reaction with its emoji, over the message it was on', () => {
        seed(item('reaction', { kind: 'reaction', emoji: '👍', content: 'ship it', inDm: true }));
        renderPanel();

        const card = screen.getByRole('listitem');
        expect(within(card).getByText('DM')).toBeTruthy();
        expect(within(card).getByText('Reacted to your message 👍')).toBeTruthy();
        expect(within(card).getByText(/ship it/)).toBeTruthy();
    });
});

describe('NotificationsPanel opening an item', () => {
    it('jumps to the message and marks the item read', () => {
        seed(item('m1', { parentId: '3' }));
        const onSelect = vi.fn();
        renderPanel(onSelect);

        fireEvent.click(screen.getByRole('button', { name: /m1 body/ }));

        expect(onSelect).toHaveBeenCalledWith('C1', 5, 'P1', '3');
        expect(useMentionsStore.getState().items.m1.readAt).toBeDefined();
    });

    it('under the unread filter, keeps the opened item selected for 3 seconds before it leaves', () => {
        seed(item('m1'), item('m2', { createdAt: NOW - 2 * HOUR }));
        renderPanel();
        fireEvent.click(screen.getByRole('button', { name: 'Unread' }));

        fireEvent.click(screen.getByRole('button', { name: /m1 body/ }));
        expect(listed()).toHaveLength(2);
        expect(screen.getByRole('button', { name: /m1 body/ }).getAttribute('aria-current')).toBe('true');

        act(() => vi.advanceTimersByTime(2999));
        expect(listed()).toHaveLength(2);
        act(() => vi.advanceTimersByTime(1));
        expect(listed()).toEqual([expect.stringContaining('m2 body')]);
    });

    it('drops the wait when it unmounts, so nothing fires after', () => {
        seed(item('m1'));
        const { unmount } = renderPanel();
        fireEvent.click(screen.getByRole('button', { name: 'Unread' }));
        const wait = lingerTimer();
        fireEvent.click(screen.getByRole('button', { name: /m1 body/ }));

        unmount();

        expect(wait.cleared()).toBe(true);
    });

    it('drops the kept item at once when the tab changes', () => {
        seed(item('m1'), item('dm', { kind: 'dm', createdAt: NOW - 2 * HOUR }));
        renderPanel();
        fireEvent.click(screen.getByRole('button', { name: 'Unread' }));
        const wait = lingerTimer();
        fireEvent.click(screen.getByRole('button', { name: /m1 body/ }));

        fireEvent.mouseDown(screen.getByRole('tab', { name: /Channels/ }), { button: 0 });

        expect(listed()).toEqual([]);
        expect(wait.cleared()).toBe(true);
    });
});

describe('NotificationsPanel empty', () => {
    it('says there is nothing new, with the filters out of reach', () => {
        renderPanel();

        expect(screen.getByText('No new notifications')).toBeTruthy();
        expect((screen.getByRole('button', { name: 'Unread' }) as HTMLButtonElement).disabled).toBe(true);
    });

    it('says the threads are still being read in while the first scan runs', () => {
        useNotificationsPanelStore.setState({ scanningCid: 'cloud-1', tab: 'thread' });
        renderPanel();

        expect(screen.getByText(/Looking for threads/)).toBeTruthy();
    });
});
