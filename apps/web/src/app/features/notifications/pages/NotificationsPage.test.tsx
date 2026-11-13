import '@testing-library/jest-dom';

import { act, fireEvent, render, screen, within } from '@testing-library/react';

import { useNotificationStore } from '../../../stores/useNotificationStore';
import type { NotificationItem } from '../../../utils/notifications';
import { NotificationsPage } from './NotificationsPage';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, options?: Record<string, unknown>) => (options ? `${key}:${JSON.stringify(options)}` : key),
        i18n: { language: 'en' },
    }),
}));
const mockNavigate = jest.fn();
jest.mock('@chatic/shared', () => ({
    ...jest.requireActual('@chatic/shared'),
    useNavigateWithTransition: () => mockNavigate,
}));
const mockToast = jest.fn();
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));
jest.mock('@chatic/ui-kit/components/ui/toast', () => ({
    ToastAction: ({ children }: any) => <button>{children}</button>,
}));
// The inbox where the session is: the real store, unscoped — every test item is in scope.
jest.mock('../../../hooks', () => ({
    useScopedNotifications: () => {
        const { useNotificationStore: store } = jest.requireActual('../../../stores/useNotificationStore');
        return Object.values(store((state: { items: Record<string, unknown> }) => state.items));
    },
}));
jest.mock('../../../ui/components', () => ({ BottomNavSpacer: () => null }));
const mockHaptic = jest.fn();
jest.mock('../../../bridge/haptics', () => ({ haptics: { play: (kind: string) => mockHaptic(kind) } }));

const now = Date.now();
const item = (over: Partial<NotificationItem>): NotificationItem => ({
    id: over.id ?? 'x',
    cloudId: 'c',
    channelId: 'ch',
    channelName: 'Trip',
    kind: 'mention',
    ownerName: 'Sis',
    content: 'hi',
    createdAt: now,
    read: false,
    chatNo: 5,
    ...over,
});
const seed = (...items: NotificationItem[]) =>
    useNotificationStore.setState({ items: Object.fromEntries(items.map(it => [it.id, it])) });

const rowByContent = (text: string) => screen.getByText(text).closest('[role="button"]') as HTMLElement;

describe('NotificationsPage', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        seed();
    });

    it('lists the items with unread counts on the tabs', () => {
        seed(
            item({ id: 'a', content: 'mention me' }),
            item({ id: 'b', kind: 'replyToMine', content: 'reply', read: true })
        );
        render(<NotificationsPage />);

        expect(screen.getByText('mention me')).toBeInTheDocument();
        expect(screen.getByText('reply')).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: /notifications\.inbox\.tabs\.all 1/ })).toHaveAttribute(
            'aria-selected',
            'true'
        );
    });

    it('opens an item at its message and reads it', () => {
        seed(item({ id: 'a', content: 'open me' }));
        render(<NotificationsPage />);

        fireEvent.click(rowByContent('open me'));

        expect(mockNavigate).toHaveBeenCalledWith('/channels/ch/room?chatNo=5');
        expect(useNotificationStore.getState().items.a.read).toBe(true);
    });

    it('hides read items under "unread only", and offers to show them all when none is left', () => {
        seed(item({ id: 'a', content: 'old', read: true }));
        render(<NotificationsPage />);

        fireEvent.click(screen.getByRole('button', { name: 'notifications.inbox.unreadOnly' }));
        expect(screen.queryByText('old')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'notifications.inbox.empty.showAll' }));
        expect(screen.getByText('old')).toBeInTheDocument();
    });

    it('marks the tab read with an undoable toast', () => {
        seed(item({ id: 'a' }), item({ id: 'b' }));
        render(<NotificationsPage />);

        fireEvent.click(screen.getByRole('button', { name: 'notifications.inbox.markAllRead' }));

        expect(Object.values(useNotificationStore.getState().items).every(it => it.read)).toBe(true);
        expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ duration: 3000 }));
    });

    it('enters selection mode on a long press, then deletes after the confirm, with undo', () => {
        jest.useFakeTimers();
        seed(item({ id: 'a', content: 'first' }), item({ id: 'b', content: 'second' }));
        render(<NotificationsPage />);

        const row = rowByContent('first');
        fireEvent.pointerDown(row, { clientX: 1, clientY: 1 });
        act(() => jest.advanceTimersByTime(600));
        fireEvent.pointerUp(row);
        jest.useRealTimers();

        expect(screen.getByText('notifications.inbox.selectedCount:{"count":1}')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'notifications.inbox.delete:{"count":1}' }));
        const dialog = screen.getByRole('alertdialog');
        fireEvent.click(within(dialog).getByRole('button', { name: 'notifications.inbox.deleteConfirm.confirm' }));

        expect(useNotificationStore.getState().items.a).toBeUndefined();
        expect(useNotificationStore.getState().items.b).toBeDefined();
        expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ duration: 3000 }));
        // Selection mode closed with it.
        expect(screen.getByText('notifications.inbox.title')).toBeInTheDocument();
    });

    it('turns "mark as read" off when every picked item is already read', () => {
        seed(item({ id: 'a', read: true, content: 'done' }));
        render(<NotificationsPage />);

        fireEvent.click(screen.getByRole('button', { name: 'notifications.inbox.select' }));
        fireEvent.click(rowByContent('done'));

        expect(screen.getByRole('button', { name: 'notifications.inbox.markRead:{"count":1}' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'notifications.inbox.delete:{"count":1}' })).toBeEnabled();
    });

    it('says there is nothing yet, with no filter or select, when the inbox is empty', () => {
        render(<NotificationsPage />);

        expect(screen.getByText('notifications.inbox.empty.none')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'notifications.inbox.select' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'notifications.inbox.unreadOnly' })).not.toBeInTheDocument();
    });

    it('names the tab when only that tab is empty', () => {
        seed(item({ id: 'a', kind: 'dmMessage', inDm: true }));
        render(<NotificationsPage />);

        fireEvent.click(screen.getByRole('tab', { name: /notifications\.inbox\.tabs\.mention/ }));
        expect(screen.getByText(/^notifications\.inbox\.empty\.tab:/)).toBeInTheDocument();
        expect(screen.getByText('notifications.inbox.empty.tabHint.mention')).toBeInTheDocument();
    });

    it('plays an impact as a long press commits to selection, then ticks per toggle, warns at delete and succeeds after', () => {
        jest.useFakeTimers();
        seed(item({ id: 'a', content: 'first' }), item({ id: 'b', content: 'second' }));
        render(<NotificationsPage />);

        const row = rowByContent('first');
        fireEvent.pointerDown(row, { clientX: 1, clientY: 1 });
        act(() => jest.advanceTimersByTime(600));
        fireEvent.pointerUp(row);
        jest.useRealTimers();
        expect(mockHaptic).toHaveBeenLastCalledWith('impact');

        fireEvent.click(rowByContent('second'));
        expect(mockHaptic).toHaveBeenLastCalledWith('selection');

        fireEvent.click(screen.getByRole('button', { name: 'notifications.inbox.delete:{"count":2}' }));
        expect(mockHaptic).toHaveBeenLastCalledWith('warning');

        fireEvent.click(
            within(screen.getByRole('alertdialog')).getByRole('button', {
                name: 'notifications.inbox.deleteConfirm.confirm',
            })
        );
        expect(mockHaptic).toHaveBeenLastCalledWith('success');
    });

    it('opens an item without a haptic of its own — the page change is the feedback', () => {
        seed(item({ id: 'a', content: 'open me' }));
        render(<NotificationsPage />);

        fireEvent.click(rowByContent('open me'));
        expect(mockHaptic).not.toHaveBeenCalled();
    });
});
