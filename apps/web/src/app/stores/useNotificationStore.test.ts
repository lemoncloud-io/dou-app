import type { NotificationItem } from '../utils/notifications/notificationModel';
import {
    NOTIFICATIONS_STORAGE_KEY,
    THREAD_PARTICIPATIONS_STORAGE_KEY,
    clearNotifications,
    useNotificationStore,
    useThreadParticipationStore,
} from './useNotificationStore';

const item = (id: string, overrides: Partial<NotificationItem> = {}): NotificationItem => ({
    id,
    cloudId: 'c1',
    channelId: 'ch1',
    kind: 'mention',
    ownerName: 'Ann',
    content: 'hello',
    createdAt: 1000,
    read: false,
    ...overrides,
});

beforeEach(() => {
    useNotificationStore.setState({ items: {} });
    useThreadParticipationStore.setState({ threads: {} });
    localStorage.clear();
});

describe('useNotificationStore', () => {
    it('persists the items under the inbox key', () => {
        useNotificationStore.getState().add(item('a'));
        const stored = JSON.parse(localStorage.getItem(NOTIFICATIONS_STORAGE_KEY) ?? '{}');
        expect(Object.keys(stored.state.items)).toEqual(['a']);
    });

    it('returns the ids a mark changed, for an undo', () => {
        const { add, markRead, markUnread } = useNotificationStore.getState();
        add(item('a'));
        add(item('b', { read: true }));
        expect(markRead(['a', 'b'])).toEqual(['a']);
        expect(useNotificationStore.getState().items.a.read).toBe(true);
        markUnread(['a']);
        expect(useNotificationStore.getState().items.a.read).toBe(false);
    });

    it('returns the removed items, and restores them', () => {
        const { add, remove, restore } = useNotificationStore.getState();
        add(item('a'));
        const removed = remove(['a', 'missing']);
        expect(removed.map(entry => entry.id)).toEqual(['a']);
        expect(useNotificationStore.getState().items.a).toBeUndefined();
        restore(removed);
        expect(useNotificationStore.getState().items.a).toEqual(item('a'));
    });

    it('marks a room read up to its cursor, and a thread read on its own', () => {
        const { add, markChannelReadUpTo, markThreadRead } = useNotificationStore.getState();
        add(item('top', { chatNo: 4 }));
        add(item('reply', { chatNo: 3, parentId: '1', kind: 'replyToMine' }));
        markChannelReadUpTo('c1', 'ch1', 5);
        expect(useNotificationStore.getState().items.top.read).toBe(true);
        expect(useNotificationStore.getState().items.reply.read).toBe(false);
        markThreadRead('c1', 'ch1', '1');
        expect(useNotificationStore.getState().items.reply.read).toBe(true);
    });

    it('does not write device storage when an action changes nothing', () => {
        useNotificationStore.getState().add(item('a'));
        const setItem = jest.spyOn(Storage.prototype, 'setItem');
        useNotificationStore.getState().add(item('a'));
        useNotificationStore.getState().markChannelReadUpTo('c1', 'other', 9);
        expect(setItem).not.toHaveBeenCalled();
        setItem.mockRestore();
    });
});

describe('clearNotifications', () => {
    it('empties the inbox and the thread record', () => {
        useNotificationStore.getState().add(item('a'));
        useThreadParticipationStore.getState().remember('c1:ch1:1', { rootMine: true }, 1);
        clearNotifications();
        expect(useNotificationStore.getState().items).toEqual({});
        expect(useThreadParticipationStore.getState().threads).toEqual({});
        const stored = JSON.parse(localStorage.getItem(THREAD_PARTICIPATIONS_STORAGE_KEY) ?? '{}');
        expect(stored.state.threads).toEqual({});
    });
});
