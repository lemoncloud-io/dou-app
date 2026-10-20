import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import type { DomainChannel } from '@chatic/data';
import { TooltipProvider } from '@chatic/ui-kit/components/ui/tooltip';

import '../../../../../i18n';

import {
    AppToaster,
    useMentionsStore,
    useMyThreadsStore,
    useNotificationsPanelStore,
    type MentionItem,
} from '../../../../shared';
import { NotificationsPanel } from './NotificationsPanel';

const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter>
        <TooltipProvider>
            {children}
            <AppToaster />
        </TooltipProvider>
    </MemoryRouter>
);

const NOW = new Date(2026, 9, 20, 15, 0).getTime();
const HOUR = 3_600_000;
const EARLIER = NOW - 5 * HOUR;

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

const stored = () => useMentionsStore.getState().items;
const card = (id: string) => screen.getByRole('checkbox', { name: new RegExp(`${id} body`) });
const startSelecting = () => fireEvent.click(screen.getByRole('button', { name: 'Select notifications' }));
const openOptions = () =>
    fireEvent.keyDown(screen.getByRole('button', { name: 'Selection options' }), { key: 'Enter' });

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
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
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe('NotificationsPanel selection mode', () => {
    it('turns the cards into checkboxes that select instead of opening', () => {
        seed(item('a'), item('b'));
        const onSelect = vi.fn();
        renderPanel(onSelect);

        startSelecting();
        fireEvent.click(card('a'));

        expect(card('a').getAttribute('aria-checked')).toBe('true');
        expect(card('b').getAttribute('aria-checked')).toBe('false');
        expect(screen.getByText('1 selected')).toBeTruthy();
        expect(onSelect).not.toHaveBeenCalled();
        expect(stored().a.readAt).toBeUndefined();
    });

    it('selects every card in the tab from the header checkbox, and shows a partial selection as mixed', () => {
        seed(item('a'), item('b'), item('d', { kind: 'dm', inDm: true }));
        useNotificationsPanelStore.setState({ tab: 'channel' });
        renderPanel();
        startSelecting();
        const all = screen.getByRole('checkbox', { name: 'Select all' });

        fireEvent.click(card('a'));
        expect(all.getAttribute('aria-checked')).toBe('mixed');

        fireEvent.click(all);
        expect(screen.getByText('2 selected')).toBeTruthy();
        expect(all.getAttribute('aria-checked')).toBe('true');

        fireEvent.click(all);
        expect(screen.getByText('0 selected')).toBeTruthy();
    });

    it('selects only the unread cards from the options menu', () => {
        seed(item('a'), item('b', { readAt: EARLIER }));
        renderPanel();
        startSelecting();

        openOptions();
        fireEvent.click(screen.getByRole('menuitem', { name: 'Select unread' }));

        expect(card('a').getAttribute('aria-checked')).toBe('true');
        expect(card('b').getAttribute('aria-checked')).toBe('false');
    });

    it('marks the selected items read and leaves the rest', () => {
        seed(item('a'), item('b'), item('c'));
        renderPanel();
        startSelecting();
        fireEvent.click(card('a'));
        fireEvent.click(card('b'));

        fireEvent.click(screen.getByRole('button', { name: 'Mark as read' }));

        expect(stored().a.readAt).toBe(NOW);
        expect(stored().b.readAt).toBe(NOW);
        expect(stored().c.readAt).toBeUndefined();
        expect(screen.getByText('0 selected')).toBeTruthy();
    });

    it('deletes the selected items only after the confirm dialog', () => {
        seed(item('a'), item('b'), item('c'));
        renderPanel();
        startSelecting();
        fireEvent.click(card('a'));
        fireEvent.click(card('b'));

        fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
        const dialog = screen.getByRole('alertdialog', { name: 'Delete 2 notifications?' });
        fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
        expect(Object.keys(stored())).toEqual(['a', 'b', 'c']);

        fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
        fireEvent.click(
            within(screen.getByRole('alertdialog', { name: 'Delete 2 notifications?' })).getByRole('button', {
                name: 'Delete',
            })
        );

        expect(Object.keys(stored())).toEqual(['c']);
    });

    it('marks the whole tab read with a toast whose undo restores only what it changed', () => {
        seed(item('a'), item('b'), item('old', { readAt: EARLIER }), item('d', { kind: 'dm', inDm: true }));
        useNotificationsPanelStore.setState({ tab: 'channel' });
        renderPanel();
        startSelecting();

        openOptions();
        fireEvent.click(screen.getByRole('menuitem', { name: 'Mark all as read' }));

        expect(stored().a.readAt).toBe(NOW);
        expect(stored().b.readAt).toBe(NOW);
        expect(stored().d.readAt).toBeUndefined();
        const toast = screen.getByText('Marked 2 notifications as read').closest('li') as HTMLElement;

        // An item gone before the undo stays gone; one read before the mark keeps its own time.
        act(() => useMentionsStore.setState(s => ({ items: { a: s.items.a, old: s.items.old, d: s.items.d } })));
        fireEvent.click(within(toast).getByRole('button', { name: 'Undo' }));

        expect(stored().a.readAt).toBeUndefined();
        expect(stored().b).toBeUndefined();
        expect(stored().old.readAt).toBe(EARLIER);
        expect(stored().d.readAt).toBeUndefined();
    });

    it('leaves selection mode once every item is deleted, so the next one opens', () => {
        seed(item('a'));
        const onSelect = vi.fn();
        renderPanel(onSelect);
        startSelecting();
        fireEvent.click(card('a'));
        fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
        fireEvent.click(
            within(screen.getByRole('alertdialog', { name: 'Delete 1 notification?' })).getByRole('button', {
                name: 'Delete',
            })
        );

        expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Notifications' }));

        act(() => useMentionsStore.getState().add(item('b')));
        fireEvent.click(screen.getByRole('button', { name: /b body/ }));

        expect(onSelect).toHaveBeenCalledWith('C1', 5, 'P1', undefined);
    });

    it('moves focus into the bar on entry and back to the select button on exit', () => {
        seed(item('a'));
        renderPanel();

        startSelecting();
        expect(document.activeElement).toBe(screen.getByRole('checkbox', { name: 'Select all' }));

        fireEvent.click(screen.getByRole('button', { name: 'Close' }));
        expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Select notifications' }));
    });

    it('drops the selection when the tab changes, and leaves the mode from the close button', () => {
        seed(item('a'), item('b'));
        renderPanel();
        startSelecting();
        fireEvent.click(card('a'));

        fireEvent.mouseDown(screen.getByRole('tab', { name: /^Channels/ }));
        expect(screen.getByText('0 selected')).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: 'Close' }));
        expect(screen.queryByRole('checkbox', { name: /a body/ })).toBeNull();
        expect(screen.getByRole('button', { name: /a body/ })).toBeTruthy();
    });
});
