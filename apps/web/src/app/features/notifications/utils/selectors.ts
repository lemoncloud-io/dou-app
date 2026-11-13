import {
    FIND_ME_KINDS,
    MENTION_KINDS,
    NOTIFICATION_TABS,
    THREAD_KINDS,
    type NotificationItem,
    type NotificationTab,
} from './notificationModel';

/**
 * Reads over the inbox's items, as pure functions. Screens compose them: scope first (`inScope`),
 * then a tab, a filter, a grouping. None sorts unless it says so; {@link newestFirst} does.
 */

/** The items, newest first. */
export const newestFirst = (items: readonly NotificationItem[]): NotificationItem[] =>
    [...items].sort((a, b) => b.createdAt - a.createdAt);

/**
 * The items of one cloud and place. The cloud is checked first because every cloud numbers its
 * places from the same start. An item with no place cannot say where in its cloud it happened, so it
 * shows in every place of that cloud rather than in none.
 */
export const inScope = (
    items: readonly NotificationItem[],
    cloudId: string,
    placeId: string | null | undefined
): NotificationItem[] => items.filter(item => item.cloudId === cloudId && (!item.placeId || item.placeId === placeId));

const isInTab = (item: NotificationItem, tab: NotificationTab): boolean => {
    switch (tab) {
        case 'all':
            return true;
        case 'group':
            return !item.inDm;
        case 'dm':
            return !!item.inDm;
        case 'thread':
            return THREAD_KINDS.has(item.kind);
        case 'mention':
            return MENTION_KINDS.has(item.kind);
    }
};

/**
 * The items one tab lists. `group` and `dm` split by the room; `thread` and `mention` by the kind,
 * so a mention in a 1:1 is in both `dm` and `mention`.
 */
export const byTab = (items: readonly NotificationItem[], tab: NotificationTab): NotificationItem[] =>
    items.filter(item => isInTab(item, tab));

/** The unread count of every tab. A screen hides a zero. */
export const unreadCounts = (items: readonly NotificationItem[]): Record<NotificationTab, number> => {
    const counts = Object.fromEntries(NOTIFICATION_TABS.map(tab => [tab, 0])) as Record<NotificationTab, number>;
    for (const item of items) {
        if (item.read) continue;
        for (const tab of NOTIFICATION_TABS) if (isInTab(item, tab)) counts[tab] += 1;
    }
    return counts;
};

/** The unread items when `on`, else all of them — the "unread only" filter. */
export const unreadOnly = (items: readonly NotificationItem[], on: boolean): NotificationItem[] =>
    on ? items.filter(item => !item.read) : [...items];

/** One day's items. A screen labels `today` and `yesterday` itself, and a `date` from `dayStart`. */
export interface NotificationDayGroup {
    day: 'today' | 'yesterday' | 'date';
    /** Local midnight of the day (epoch ms) — the key, and what a `date` label is formatted from. */
    dayStart: number;
    items: NotificationItem[];
}

const startOfLocalDay = (time: number): number => {
    const date = new Date(time);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
};

/**
 * The items grouped by the local day they were sent, newest day first and newest item first inside
 * each. Days are compared as calendar dates in the device's time zone, not as 24-hour spans, so a
 * message from 23:59 yesterday is "yesterday" at 00:01.
 */
export const groupByDay = (items: readonly NotificationItem[], now: number): NotificationDayGroup[] => {
    const today = startOfLocalDay(now);
    const yesterdayDate = new Date(today);
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterday = yesterdayDate.getTime();

    const groups = new Map<number, NotificationItem[]>();
    for (const item of newestFirst(items)) {
        const dayStart = startOfLocalDay(item.createdAt);
        const group = groups.get(dayStart);
        if (group) group.push(item);
        else groups.set(dayStart, [item]);
    }
    return [...groups.entries()]
        .sort(([a], [b]) => b - a)
        .map(([dayStart, dayItems]) => ({
            day: dayStart === today ? 'today' : dayStart === yesterday ? 'yesterday' : 'date',
            dayStart,
            items: dayItems,
        }));
};

/**
 * What is looking for me: unread mentions, thread mentions and replies to my messages, newest first.
 * Reactions, plain 1:1 messages and replies in threads I only joined stay in the full inbox.
 */
export const findMe = (items: readonly NotificationItem[]): NotificationItem[] =>
    newestFirst(items.filter(item => !item.read && FIND_ME_KINDS.has(item.kind)));

/** Whether anything is unread — the dot on the bottom navigation's inbox tab. Pass scoped items. */
export const hasUnreadInScope = (items: readonly NotificationItem[]): boolean => items.some(item => !item.read);

/** The unread marks one room's home row shows. */
export interface ChannelBadges {
    /** Unread `mention` and `threadMention` items. */
    mentions: number;
    /** Unread `replyToMine` and `participatedThread` items. */
    threads: number;
}

/**
 * One room's unread mention and thread counts. Channel ids repeat across clouds, so pass items
 * already scoped to the cloud (`inScope`).
 */
export const channelBadges = (items: readonly NotificationItem[], channelId: string): ChannelBadges => {
    const badges: ChannelBadges = { mentions: 0, threads: 0 };
    for (const item of items) {
        if (item.read || item.channelId !== channelId) continue;
        if (MENTION_KINDS.has(item.kind)) badges.mentions += 1;
        else if (THREAD_KINDS.has(item.kind)) badges.threads += 1;
    }
    return badges;
};
