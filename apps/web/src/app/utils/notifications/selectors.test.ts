import type { NotificationItem } from './notificationModel';
import {
    byTab,
    channelBadges,
    findMe,
    groupByDay,
    hasUnreadInScope,
    inScope,
    newestFirst,
    unreadCounts,
    unreadOnly,
} from './selectors';

const item = (id: string, overrides: Partial<NotificationItem> = {}): NotificationItem => ({
    id,
    cloudId: 'c1',
    placeId: 'p1',
    channelId: 'ch1',
    kind: 'mention',
    ownerName: 'Ann',
    content: 'hello',
    createdAt: 1000,
    read: false,
    ...overrides,
});

const ids = (items: NotificationItem[]): string[] => items.map(entry => entry.id);

describe('inScope', () => {
    it('keeps the cloud and place, and place-less items of the cloud', () => {
        const items = [
            item('here'),
            item('noPlace', { placeId: undefined }),
            item('otherPlace', { placeId: 'p2' }),
            // Same place id, another cloud: place ids repeat across clouds.
            item('otherCloud', { cloudId: 'c2' }),
        ];
        expect(ids(inScope(items, 'c1', 'p1'))).toEqual(['here', 'noPlace']);
    });
});

describe('byTab', () => {
    const items = [
        item('groupMention'),
        item('dmMention', { inDm: true }),
        item('dm', { inDm: true, kind: 'dmMessage' }),
        item('reply', { kind: 'replyToMine' }),
        item('joined', { kind: 'participatedThread' }),
        item('threadMention', { kind: 'threadMention' }),
        item('reaction', { kind: 'reaction' }),
    ];

    it('lists everything under all', () => {
        expect(byTab(items, 'all')).toHaveLength(items.length);
    });

    it('splits group and dm by the room', () => {
        expect(ids(byTab(items, 'group'))).toEqual(['groupMention', 'reply', 'joined', 'threadMention', 'reaction']);
        expect(ids(byTab(items, 'dm'))).toEqual(['dmMention', 'dm']);
    });

    it('splits thread and mention by the kind', () => {
        expect(ids(byTab(items, 'thread'))).toEqual(['reply', 'joined']);
        expect(ids(byTab(items, 'mention'))).toEqual(['groupMention', 'dmMention', 'threadMention']);
    });
});

describe('unreadCounts', () => {
    it('counts unread items per tab', () => {
        const counts = unreadCounts([
            item('a'),
            item('b', { inDm: true, kind: 'dmMessage' }),
            item('c', { kind: 'replyToMine' }),
            item('read', { read: true }),
        ]);
        expect(counts).toEqual({ all: 3, group: 2, dm: 1, thread: 1, mention: 1 });
    });

    it('is zero everywhere for an empty list', () => {
        expect(unreadCounts([])).toEqual({ all: 0, group: 0, dm: 0, thread: 0, mention: 0 });
    });
});

describe('unreadOnly', () => {
    it('filters to unread only when on', () => {
        const items = [item('a'), item('b', { read: true })];
        expect(ids(unreadOnly(items, true))).toEqual(['a']);
        expect(ids(unreadOnly(items, false))).toEqual(['a', 'b']);
    });
});

describe('groupByDay', () => {
    // Local times, so the test holds in any time zone.
    const now = new Date(2026, 10, 13, 10, 0).getTime();
    const at = (day: number, hour: number) => new Date(2026, 10, day, hour, 0).getTime();

    it('groups by local calendar day, newest day and item first', () => {
        const groups = groupByDay(
            [
                item('older', { createdAt: at(10, 9) }),
                item('todayEarly', { createdAt: at(13, 1) }),
                item('lateYesterday', { createdAt: at(12, 23) }),
                item('todayLate', { createdAt: at(13, 9) }),
            ],
            now
        );
        expect(groups.map(group => group.day)).toEqual(['today', 'yesterday', 'date']);
        expect(ids(groups[0].items)).toEqual(['todayLate', 'todayEarly']);
        expect(ids(groups[1].items)).toEqual(['lateYesterday']);
        expect(groups[2].dayStart).toBe(new Date(2026, 10, 10).getTime());
    });

    it('treats a message from just before midnight as yesterday', () => {
        const justAfterMidnight = new Date(2026, 10, 13, 0, 1).getTime();
        const groups = groupByDay(
            [item('a', { createdAt: new Date(2026, 10, 12, 23, 59).getTime() })],
            justAfterMidnight
        );
        expect(groups[0].day).toBe('yesterday');
    });

    it('returns no groups for no items', () => {
        expect(groupByDay([], now)).toEqual([]);
    });
});

describe('findMe', () => {
    it('lists unread mentions, thread mentions and replies to mine, newest first', () => {
        const result = findMe([
            item('mention', { createdAt: 1 }),
            item('threadMention', { kind: 'threadMention', createdAt: 3 }),
            item('reply', { kind: 'replyToMine', createdAt: 2 }),
            item('joined', { kind: 'participatedThread' }),
            item('reaction', { kind: 'reaction' }),
            item('dm', { kind: 'dmMessage', inDm: true }),
            item('readMention', { read: true }),
        ]);
        expect(ids(result)).toEqual(['threadMention', 'reply', 'mention']);
    });
});

describe('hasUnreadInScope', () => {
    it('is true when anything is unread', () => {
        expect(hasUnreadInScope([item('a', { read: true }), item('b')])).toBe(true);
        expect(hasUnreadInScope([item('a', { read: true })])).toBe(false);
        expect(hasUnreadInScope([])).toBe(false);
    });
});

describe('channelBadges', () => {
    it('counts one room’s unread mentions and thread replies', () => {
        const items = [
            item('m1'),
            item('m2', { kind: 'threadMention' }),
            item('t1', { kind: 'replyToMine' }),
            item('t2', { kind: 'participatedThread' }),
            item('reaction', { kind: 'reaction' }),
            item('read', { read: true }),
            item('otherRoom', { channelId: 'ch2' }),
        ];
        expect(channelBadges(items, 'ch1')).toEqual({ mentions: 2, threads: 2 });
        expect(channelBadges(items, 'ch3')).toEqual({ mentions: 0, threads: 0 });
    });
});

describe('newestFirst', () => {
    it('sorts by createdAt descending without touching the input', () => {
        const items = [item('old', { createdAt: 1 }), item('new', { createdAt: 2 })];
        expect(ids(newestFirst(items))).toEqual(['new', 'old']);
        expect(ids(items)).toEqual(['old', 'new']);
    });
});
