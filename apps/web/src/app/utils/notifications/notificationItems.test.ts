import {
    NOTIFICATIONS_MAX,
    addItem,
    markChannelItemsReadUpTo,
    markItemsRead,
    markItemsUnread,
    markThreadItemsRead,
    removeItems,
    restoreItems,
    unreadIdsOf,
    type NotificationItems,
} from './notificationItems';
import type { NotificationItem } from './notificationModel';

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

const mapOf = (...items: NotificationItem[]): NotificationItems =>
    Object.fromEntries(items.map(entry => [entry.id, entry]));

describe('addItem', () => {
    it('adds a new item', () => {
        const next = addItem({}, item('a'));
        expect(Object.keys(next)).toEqual(['a']);
    });

    it('ignores an id already held, keeping the held state', () => {
        const items = mapOf(item('a', { read: true }));
        const next = addItem(items, item('a', { read: false, content: 'again' }));
        expect(next).toBe(items);
        expect(next.a.read).toBe(true);
    });

    it('drops the oldest read items first when over the cap', () => {
        const items: NotificationItems = {};
        for (let i = 0; i < NOTIFICATIONS_MAX; i++) {
            // The two oldest are unread; one later item is read.
            items[`u${i}`] = item(`u${i}`, { createdAt: i, read: i === 10 });
        }
        const next = addItem(items, item('new', { createdAt: 10_000 }));
        expect(Object.keys(next)).toHaveLength(NOTIFICATIONS_MAX);
        expect(next.u10).toBeUndefined();
        expect(next.u0).toBeDefined();
        expect(next.new).toBeDefined();
    });

    it('drops the oldest unread item when nothing read is left', () => {
        const items: NotificationItems = {};
        for (let i = 0; i < NOTIFICATIONS_MAX; i++) items[`u${i}`] = item(`u${i}`, { createdAt: i + 1 });
        const next = addItem(items, item('new', { createdAt: 10_000 }));
        expect(next.u0).toBeUndefined();
        expect(next.u1).toBeDefined();
        expect(next.new).toBeDefined();
    });
});

describe('read marks', () => {
    const items = mapOf(item('a'), item('b', { read: true }), item('c'));

    it('lists the held unread ids among those asked for', () => {
        expect(unreadIdsOf(items, ['a', 'b', 'missing'])).toEqual(['a']);
    });

    it('marks items read and back unread', () => {
        const read = markItemsRead(items, ['a', 'c']);
        expect(read.a.read).toBe(true);
        expect(read.c.read).toBe(true);
        const undone = markItemsUnread(read, ['a']);
        expect(undone.a.read).toBe(false);
        expect(undone.c.read).toBe(true);
    });

    it('returns the same map when nothing changes', () => {
        expect(markItemsRead(items, ['b', 'missing'])).toBe(items);
        expect(markItemsUnread(items, ['a'])).toBe(items);
    });
});

describe('remove and restore', () => {
    it('removes held items and restores them as they were', () => {
        const items = mapOf(item('a'), item('b', { read: true }));
        const removed = removeItems(items, ['b', 'missing']);
        expect(removed.b).toBeUndefined();
        const restored = restoreItems(removed, [items.b]);
        expect(restored.b).toEqual(items.b);
    });

    it('keeps the held item when a restored id is already back', () => {
        const items = mapOf(item('a', { read: true }));
        expect(restoreItems(items, [item('a', { read: false })])).toBe(items);
    });

    it('returns the same map when there is nothing to remove', () => {
        const items = mapOf(item('a'));
        expect(removeItems(items, ['missing'])).toBe(items);
    });
});

describe('markChannelItemsReadUpTo', () => {
    const items = mapOf(
        item('at', { chatNo: 5 }),
        item('below', { chatNo: 3 }),
        item('above', { chatNo: 6 }),
        item('thread', { chatNo: 4, parentId: '2', kind: 'replyToMine' }),
        item('otherRoom', { chatNo: 1, channelId: 'ch2' }),
        item('otherCloud', { chatNo: 1, cloudId: 'c2' })
    );

    it('marks the room’s top-level items at or below the cursor', () => {
        const next = markChannelItemsReadUpTo(items, 'c1', 'ch1', 5);
        expect(next.at.read).toBe(true);
        expect(next.below.read).toBe(true);
        expect(next.above.read).toBe(false);
    });

    it('leaves thread items, other rooms and other clouds alone', () => {
        const next = markChannelItemsReadUpTo(items, 'c1', 'ch1', 5);
        expect(next.thread.read).toBe(false);
        expect(next.otherRoom.read).toBe(false);
        expect(next.otherCloud.read).toBe(false);
    });

    it('returns the same map when nothing is at or below the cursor', () => {
        expect(markChannelItemsReadUpTo(items, 'c1', 'ch1', 0)).toBe(items);
        expect(markChannelItemsReadUpTo(items, 'c1', 'ch9', 99)).toBe(items);
    });
});

describe('markThreadItemsRead', () => {
    it('marks every item of one thread read', () => {
        const items = mapOf(
            item('reply', { parentId: '7', kind: 'participatedThread' }),
            item('mention', { parentId: '7', kind: 'threadMention' }),
            item('otherThread', { parentId: '8', kind: 'replyToMine' }),
            item('top', { kind: 'mention' })
        );
        const next = markThreadItemsRead(items, 'c1', 'ch1', '7');
        expect(next.reply.read).toBe(true);
        expect(next.mention.read).toBe(true);
        expect(next.otherThread.read).toBe(false);
        expect(next.top.read).toBe(false);
    });
});
