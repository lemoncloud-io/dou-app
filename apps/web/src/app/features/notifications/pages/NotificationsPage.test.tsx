import '@testing-library/jest-dom';

import { act, fireEvent, render, screen, within } from '@testing-library/react';

import { takeScroll } from '../../../hooks/useScrollRestoration';
import { useNotificationStore } from '../../../stores/useNotificationStore';
import type { NotificationItem } from '../../../utils/notifications';
import { useNotificationsViewStore } from '../stores/useNotificationsViewStore';
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
jest.mock('../../../hooks', () => {
    // The real hook and its memory: the return-from-an-item tests depend on both.
    const restoration = jest.requireActual('../../../hooks/useScrollRestoration');
    return {
        useScopedNotifications: () => {
            const { useNotificationStore: store } = jest.requireActual('../../../stores/useNotificationStore');
            return Object.values(store((state: { items: Record<string, unknown> }) => state.items));
        },
        useScrollRestoration: restoration.useScrollRestoration,
        takeScroll: restoration.takeScroll,
        toCloudId: (cid: string | null | undefined) => cid || 'default',
        useScrollChrome: jest.requireActual('../../../hooks/useScrollChrome').useScrollChrome,
    };
});
// Where the session is, for the scroll memory's key. Mutable so a test can move it.
let mockSelection: { selectedCloudId: string | null; selectedSiteId: string | null } = {
    selectedCloudId: 'c',
    selectedSiteId: 's',
};
jest.mock('@chatic/runtime', () => ({
    runtime: { session: { useSessionSelection: () => mockSelection } },
}));
// How the page was reached: a back press is POP, the bottom nav REPLACE, opening a link PUSH.
let mockNavigationType = 'POP';
jest.mock('react-router-dom', () => ({
    ...jest.requireActual('react-router-dom'),
    useNavigationType: () => mockNavigationType,
}));
jest.mock('../../../ui/components', () => ({ BottomNavSpacer: () => null }));
// Author photos, keyed `${placeId}@${ownerId}` as the profile reader keys them.
let mockProfiles = new Map<string, { thumbnail?: string }>();
jest.mock('../../../hooks/useSenderProfiles', () => ({ useSenderProfiles: () => mockProfiles }));
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
// The items as the feed would have worked them out from the rows, with nothing done to them yet.
const seed = (...items: NotificationItem[]) => {
    const byId = Object.fromEntries(items.map(it => [it.id, it]));
    useNotificationStore.setState({
        computed: byId,
        items: byId,
        overlay: { entries: {}, threads: {}, baselineAt: 0 },
    });
};

const rowByContent = (text: string) => screen.getByText(text).closest('[role="button"]') as HTMLElement;

describe('NotificationsPage', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        seed();
        // Both outlive a page on purpose, so each test starts from a fresh visit.
        useNotificationsViewStore.setState({ tab: 'all', unreadOnly: false });
        mockSelection = { selectedCloudId: 'c', selectedSiteId: 's' };
        mockNavigationType = 'POP';
        mockProfiles = new Map();
        takeScroll('notifications:c:s');
        takeScroll('notifications:c:other');
    });

    it("draws the author's place-profile photo, and the default glyph where there is none", () => {
        mockProfiles = new Map([['s@u1', { thumbnail: 'https://img.example/u1.png' }]]);
        seed(
            item({ id: 'a', placeId: 's', ownerId: 'u1', content: 'with photo' }),
            item({ id: 'b', placeId: 's', ownerId: 'u2', content: 'no profile' }),
            item({ id: 'c', ownerId: 'u1', content: 'no place' })
        );
        const { container } = render(<NotificationsPage />);

        const images = container.querySelectorAll('img');
        expect(images).toHaveLength(1);
        expect(images[0]).toHaveAttribute('src', 'https://img.example/u1.png');
        expect(rowByContent('with photo').querySelector('img')).toBe(images[0]);
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

    it('turns "mark as read" off, with no count, when every picked item is already read', () => {
        seed(item({ id: 'a', read: true, content: 'done' }));
        render(<NotificationsPage />);

        fireEvent.click(screen.getByRole('button', { name: 'notifications.inbox.select' }));
        expect(screen.getByRole('button', { name: 'notifications.inbox.markReadNone' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'notifications.inbox.deleteNone' })).toBeDisabled();
        fireEvent.click(rowByContent('done'));

        expect(screen.getByRole('button', { name: 'notifications.inbox.markReadNone' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'notifications.inbox.delete:{"count":1}' })).toBeEnabled();
    });

    it('offers "Select all" as the only quick pick, and counts only the unread picks for "mark as read"', () => {
        seed(
            item({ id: 'a', content: 'one', createdAt: now - 1 }),
            item({ id: 'b', content: 'two', createdAt: now - 2 }),
            item({ id: 'c', content: 'three', read: true, createdAt: now - 3 })
        );
        render(<NotificationsPage />);
        fireEvent.click(screen.getByRole('button', { name: 'notifications.inbox.select' }));

        expect(screen.queryByText(/notifications\.inbox\.quick\./)).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'notifications.inbox.selectAll' }));

        expect(screen.getByText('notifications.inbox.selectedCount:{"count":3}')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'notifications.inbox.markRead:{"count":2}' })).toBeEnabled();
        expect(screen.getByRole('button', { name: 'notifications.inbox.delete:{"count":3}' })).toBeEnabled();

        // Pressed again on the whole list, it clears.
        fireEvent.click(screen.getByRole('button', { name: 'notifications.inbox.selectAll' }));
        expect(screen.getByText('notifications.inbox.selectedCount:{"count":0}')).toBeInTheDocument();
    });

    it('keeps selection mode and the picks after "mark as read", so they can be deleted next', () => {
        seed(
            item({ id: 'a', content: 'one', createdAt: now - 1 }),
            item({ id: 'b', content: 'two', read: true, createdAt: now - 2 })
        );
        render(<NotificationsPage />);
        fireEvent.click(screen.getByRole('button', { name: 'notifications.inbox.select' }));
        fireEvent.click(screen.getByRole('button', { name: 'notifications.inbox.selectAll' }));

        fireEvent.click(screen.getByRole('button', { name: 'notifications.inbox.markRead:{"count":1}' }));

        expect(useNotificationStore.getState().items.a.read).toBe(true);
        expect(mockToast).toHaveBeenCalledWith(
            expect.objectContaining({ title: 'notifications.inbox.markedRead:{"count":1}' })
        );
        expect(screen.getByText('notifications.inbox.selectedCount:{"count":2}')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'notifications.inbox.markReadNone' })).toBeDisabled();

        fireEvent.click(screen.getByRole('button', { name: 'notifications.inbox.delete:{"count":2}' }));
        fireEvent.click(
            within(screen.getByRole('alertdialog')).getByRole('button', {
                name: 'notifications.inbox.deleteConfirm.confirm',
            })
        );
        expect(useNotificationStore.getState().items).toEqual({});
        expect(screen.getByText('notifications.inbox.title')).toBeInTheDocument();
    });

    it('keeps items marked read in selection mode listed under "unread only" until the mode closes', () => {
        seed(item({ id: 'a', content: 'one' }));
        render(<NotificationsPage />);
        fireEvent.click(screen.getByRole('button', { name: 'notifications.inbox.unreadOnly' }));
        fireEvent.click(screen.getByRole('button', { name: 'notifications.inbox.select' }));
        fireEvent.click(rowByContent('one'));

        fireEvent.click(screen.getByRole('button', { name: 'notifications.inbox.markRead:{"count":1}' }));
        expect(screen.getByText('one')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'notifications.inbox.delete:{"count":1}' })).toBeEnabled();

        fireEvent.click(screen.getByRole('button', { name: 'notifications.inbox.cancel' }));
        expect(screen.queryByText('one')).not.toBeInTheDocument();
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

    it('steps the title down once the list scrolls, and back up at the top', () => {
        seed(item({ id: 'a', content: 'first' }));
        const { container } = render(<NotificationsPage />);
        const title = screen.getByRole('heading', { level: 1 });
        const list = container.querySelector('.overflow-y-auto') as HTMLElement;

        expect(title).toHaveAttribute('data-compact', 'false');
        list.scrollTop = 40;
        fireEvent.scroll(list);
        expect(title).toHaveAttribute('data-compact', 'true');
        list.scrollTop = 0;
        fireEvent.scroll(list);
        expect(title).toHaveAttribute('data-compact', 'false');
    });

    describe('coming back from an opened item', () => {
        // jsdom lays nothing out, so every element reports a zero-height box and a restore would be
        // skipped as "nothing to scroll". Give the list a scrollable box for these cases only.
        beforeEach(() => {
            jest.spyOn(Element.prototype, 'scrollHeight', 'get').mockReturnValue(2000);
            jest.spyOn(Element.prototype, 'clientHeight', 'get').mockReturnValue(500);
        });
        afterEach(() => jest.restoreAllMocks());

        const scrollList = (view: ReturnType<typeof render>) =>
            view.container.querySelector('.overflow-y-auto') as HTMLElement;
        const leaveAt = (view: ReturnType<typeof render>, top: number) => {
            const list = scrollList(view);
            list.scrollTop = top;
            fireEvent.scroll(list);
            view.unmount();
        };

        it('lands at the scroll offset it left', () => {
            seed(item({ id: 'a', content: 'first' }), item({ id: 'b', content: 'second' }));
            leaveAt(render(<NotificationsPage />), 640);

            const again = render(<NotificationsPage />);
            expect(scrollList(again).scrollTop).toBe(640);
        });

        it('keeps the tab and the "unread only" filter it left', () => {
            seed(item({ id: 'a', content: 'mention me' }), item({ id: 'b', kind: 'replyToMine', content: 'reply' }));
            const first = render(<NotificationsPage />);
            fireEvent.click(screen.getByRole('tab', { name: /notifications\.inbox\.tabs\.mention/ }));
            fireEvent.click(screen.getByRole('button', { name: 'notifications.inbox.unreadOnly' }));
            first.unmount();

            render(<NotificationsPage />);
            expect(screen.getByRole('tab', { name: /notifications\.inbox\.tabs\.mention/ })).toHaveAttribute(
                'aria-selected',
                'true'
            );
            expect(screen.getByRole('button', { name: 'notifications.inbox.unreadOnly' })).toHaveAttribute(
                'aria-pressed',
                'true'
            );
            expect(screen.getByText('mention me')).toBeInTheDocument();
            expect(screen.queryByText('reply')).not.toBeInTheDocument();
        });

        it('keeps the offset per place, so another place starts at the top', () => {
            seed(item({ id: 'a', content: 'first' }), item({ id: 'b', content: 'second' }));
            leaveAt(render(<NotificationsPage />), 640);

            mockSelection = { selectedCloudId: 'c', selectedSiteId: 'other' };
            const elsewhere = render(<NotificationsPage />);
            expect(scrollList(elsewhere).scrollTop).toBe(0);
            elsewhere.unmount();

            mockSelection = { selectedCloudId: 'c', selectedSiteId: 's' };
            const back = render(<NotificationsPage />);
            expect(scrollList(back).scrollTop).toBe(640);
        });

        it('starts fresh — all, filter off, at the top — when it is entered rather than returned to', () => {
            seed(item({ id: 'a', content: 'mention me' }), item({ id: 'b', kind: 'replyToMine', content: 'reply' }));
            const first = render(<NotificationsPage />);
            fireEvent.click(screen.getByRole('tab', { name: /notifications\.inbox\.tabs\.mention/ }));
            fireEvent.click(screen.getByRole('button', { name: 'notifications.inbox.unreadOnly' }));
            leaveAt(first, 640);

            // The bottom nav's bell replaces the entry rather than popping back to it.
            mockNavigationType = 'REPLACE';
            const entered = render(<NotificationsPage />);
            expect(screen.getByRole('tab', { name: /notifications\.inbox\.tabs\.all/ })).toHaveAttribute(
                'aria-selected',
                'true'
            );
            expect(screen.getByRole('button', { name: 'notifications.inbox.unreadOnly' })).toHaveAttribute(
                'aria-pressed',
                'false'
            );
            expect(screen.getByText('reply')).toBeInTheDocument();
            expect(scrollList(entered).scrollTop).toBe(0);
        });

        it('drops the old offset when "show all" replaces a list it was waiting for', () => {
            seed(item({ id: 'a', content: 'unread one' }), item({ id: 'b', content: 'read one', read: true }));
            const first = render(<NotificationsPage />);
            fireEvent.click(screen.getByRole('button', { name: 'notifications.inbox.unreadOnly' }));
            leaveAt(first, 640);

            // Opening it read the last unread item, so the return lands on "nothing unread".
            seed(
                item({ id: 'a', content: 'unread one', read: true }),
                item({ id: 'b', content: 'read one', read: true })
            );
            const again = render(<NotificationsPage />);
            fireEvent.click(screen.getByRole('button', { name: 'notifications.inbox.empty.showAll' }));

            expect(screen.getByText('read one')).toBeInTheDocument();
            expect(scrollList(again).scrollTop).toBe(0);
        });
    });
});
