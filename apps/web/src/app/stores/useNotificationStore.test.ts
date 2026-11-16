import type { NotificationItem } from '../utils/notifications/notificationModel';
import { EMPTY_OVERLAY } from '../utils/notifications/notificationOverlay';
import {
    NOTIFICATION_OVERLAY_STORAGE_KEY,
    RETIRED_NOTIFICATION_STORAGE_KEYS,
    clearNotifications,
    removeRetiredNotificationStorage,
    useNotificationStore,
} from './useNotificationStore';

const now = Date.now();
const item = (id: string, overrides: Partial<NotificationItem> = {}): NotificationItem => ({
    id,
    cloudId: 'c1',
    channelId: 'ch1',
    chatNo: 5,
    kind: 'mention',
    ownerName: 'Ann',
    content: 'hello',
    createdAt: now,
    read: false,
    ...overrides,
});

const store = () => useNotificationStore.getState();

beforeEach(() => {
    useNotificationStore.setState({ computed: {}, overlay: EMPTY_OVERLAY, items: {}, computedRooms: {} });
    localStorage.clear();
});

describe('useNotificationStore', () => {
    it("shows a room's computed items, and replaces only that room's on the next run", () => {
        store().setRoomItems('c1', 'ch1', [item('a'), item('b')]);
        store().setRoomItems('c1', 'ch2', [item('c', { channelId: 'ch2' })]);
        store().setRoomItems('c1', 'ch1', [item('b')]);

        expect(Object.keys(store().items).sort()).toEqual(['b', 'c']);
    });

    it('writes nothing when a room comes back the same', () => {
        store().setRoomItems('c1', 'ch1', [item('a')]);
        const before = store().computed;

        store().setRoomItems('c1', 'ch1', [item('a')]);

        expect(store().computed).toBe(before);
    });

    it('drops the rooms that left the scope, and every room of another cloud', () => {
        store().setRoomItems('c1', 'ch1', [item('a')]);
        store().setRoomItems('c1', 'ch2', [item('b', { channelId: 'ch2' })]);
        store().setRoomItems('c2', 'ch1', [item('c', { cloudId: 'c2' })]);

        store().retainRooms('c1', new Set(['ch1']));

        expect(Object.keys(store().items)).toEqual(['a']);
    });

    it('keeps a mark across a recomputation of the room, and persists only the overlay', () => {
        store().setRoomItems('c1', 'ch1', [item('a')]);
        expect(store().markRead(['a'])).toEqual(['a']);

        store().setRoomItems('c1', 'ch1', [item('a', { content: 'edited' })]);

        expect(store().items.a).toMatchObject({ content: 'edited', read: true });
        const stored = JSON.parse(localStorage.getItem(NOTIFICATION_OVERLAY_STORAGE_KEY) ?? '{}');
        expect(Object.keys(stored.state)).toEqual(['overlay']);
        expect(stored.state.overlay.entries.a).toMatchObject({ state: 'read' });
    });

    it('undoes a mark read and a delete exactly', () => {
        store().setRoomItems('c1', 'ch1', [item('a'), item('b')]);

        const marked = store().markRead(['a']);
        store().markUnread(marked);
        expect(store().items.a.read).toBe(false);

        const removed = store().remove(['a', 'b']);
        expect(store().items).toEqual({});
        store().restore(removed);
        expect(Object.keys(store().items).sort()).toEqual(['a', 'b']);
    });

    it('keeps a deleted item away when its room is worked out again', () => {
        store().setRoomItems('c1', 'ch1', [item('a')]);
        store().remove(['a']);

        store().setRoomItems('c1', 'ch1', [item('a'), item('b')]);

        expect(Object.keys(store().items)).toEqual(['b']);
    });

    it("reads a thread's items so far when its screen is opened, and not a later reply", () => {
        store().setRoomItems('c1', 'ch1', [item('a', { parentId: '7', chatNo: 8 })]);

        store().markThreadRead('c1', 'ch1', '7');
        store().setRoomItems('c1', 'ch1', [
            item('a', { parentId: '7', chatNo: 8 }),
            item('b', { parentId: '7', chatNo: 9 }),
        ]);

        expect(store().items.a.read).toBe(true);
        expect(store().items.b.read).toBe(false);
    });

    it('shows nothing past the retention window, so nothing can be done to it there', () => {
        const old = now - 30 * 24 * 60 * 60 * 1000;
        store().setRoomItems('c1', 'ch1', [item('a', { createdAt: old }), item('b')]);

        expect(Object.keys(store().items)).toEqual(['b']);
        store().markRead(['a', 'b']);
        expect(Object.keys(store().overlay.entries)).toEqual(['b']);
    });

    it('records which rooms have been worked out, and forgets the ones that left', () => {
        store().setRoomItems('c1', 'ch1', []);
        store().setRoomItems('c1', 'ch2', []);

        store().retainRooms('c1', new Set(['ch1']));

        expect(store().computedRooms).toEqual({ 'c1:ch1': true });
    });
});

describe('clearNotifications', () => {
    it('empties the items and starts a new overlay from now', () => {
        store().setRoomItems('c1', 'ch1', [item('a')]);
        store().remove(['a']);

        clearNotifications();

        expect(store().items).toEqual({});
        expect(store().computed).toEqual({});
        expect(store().computedRooms).toEqual({});
        expect(store().overlay.entries).toEqual({});
        // A thread reply cached before the next account signed in is not news to it.
        expect(store().overlay.baselineAt).toBeGreaterThanOrEqual(now);
    });
});

describe('removeRetiredNotificationStorage', () => {
    it('removes the keys the snapshot inbox wrote and leaves the overlay', () => {
        for (const key of RETIRED_NOTIFICATION_STORAGE_KEYS) localStorage.setItem(key, '{}');
        localStorage.setItem(NOTIFICATION_OVERLAY_STORAGE_KEY, '{}');

        removeRetiredNotificationStorage();

        for (const key of RETIRED_NOTIFICATION_STORAGE_KEYS) expect(localStorage.getItem(key)).toBeNull();
        expect(localStorage.getItem(NOTIFICATION_OVERLAY_STORAGE_KEY)).toBe('{}');
    });
});
