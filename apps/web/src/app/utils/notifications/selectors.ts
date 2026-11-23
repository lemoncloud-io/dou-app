import {
    FIND_ME_KINDS,
    MENTION_KINDS,
    NOTIFICATION_TABS,
    THREAD_KINDS,
    type NotificationItem,
    type NotificationTab,
} from './notificationModel';

export const newestFirst = (items: readonly NotificationItem[]): NotificationItem[] =>
    [...items].sort((a, b) => b.createdAt - a.createdAt);

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

export const byTab = (items: readonly NotificationItem[], tab: NotificationTab): NotificationItem[] =>
    items.filter(item => isInTab(item, tab));

export const unreadCounts = (items: readonly NotificationItem[]): Record<NotificationTab, number> => {
    const counts = Object.fromEntries(NOTIFICATION_TABS.map(tab => [tab, 0])) as Record<NotificationTab, number>;
    for (const item of items) {
        if (item.read) continue;
        for (const tab of NOTIFICATION_TABS) if (isInTab(item, tab)) counts[tab] += 1;
    }
    return counts;
};

export const unreadOnly = (items: readonly NotificationItem[], on: boolean): NotificationItem[] =>
    on ? items.filter(item => !item.read) : [...items];

export interface NotificationDayGroup {
    day: 'today' | 'yesterday' | 'date';
    dayStart: number;
    items: NotificationItem[];
}

const startOfLocalDay = (time: number): number => {
    const date = new Date(time);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
};

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

export const findMe = (items: readonly NotificationItem[]): NotificationItem[] =>
    newestFirst(items.filter(item => !item.read && FIND_ME_KINDS.has(item.kind)));

export const hasUnreadInScope = (items: readonly NotificationItem[]): boolean => items.some(item => !item.read);

export interface ChannelBadges {
    mentions: number;
    threads: number;
}

export const channelBadges = (items: readonly NotificationItem[], channelId: string): ChannelBadges => {
    const badges: ChannelBadges = { mentions: 0, threads: 0 };
    for (const item of items) {
        if (item.read || item.channelId !== channelId) continue;
        if (MENTION_KINDS.has(item.kind)) badges.mentions += 1;
        else if (THREAD_KINDS.has(item.kind)) badges.threads += 1;
    }
    return badges;
};
