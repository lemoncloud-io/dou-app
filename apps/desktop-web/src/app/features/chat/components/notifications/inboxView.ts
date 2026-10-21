import {
    INBOX_TABS,
    inboxKindOf,
    isMentionKind,
    type InboxSort,
    type InboxTab,
    type MentionItem,
} from '../../../../shared';

/** Where an item happened — the chip on its card and the tab it falls under. */
export type InboxSource = 'channel' | 'dm' | 'thread';

/**
 * A thread first: a reply, or a mention inside one, is about that thread wherever the thread is.
 * Then a 1:1 — a new message there, or a reaction to mine there. Everything else happened in a
 * channel, old items with no kind among them.
 */
export const inboxSource = (item: Pick<MentionItem, 'kind' | 'parentId' | 'inDm'>): InboxSource => {
    if (item.parentId) return 'thread';
    const kind = inboxKindOf(item);
    if (kind === 'dm' || (kind === 'reaction' && item.inDm)) return 'dm';
    return 'channel';
};

/** Mentions is the one tab that sorts by why rather than where: a mention of me anywhere. */
export const isInTab = (item: MentionItem, tab: InboxTab): boolean => {
    if (tab === 'all') return true;
    if (tab === 'mention') return isMentionKind(item);
    return inboxSource(item) === tab;
};

/** Unread items per tab — the badges on the tabs. */
export const inboxTabCounts = (items: MentionItem[]): Record<InboxTab, number> => {
    const counts: Record<InboxTab, number> = { all: 0, channel: 0, dm: 0, thread: 0, mention: 0 };
    for (const item of items) {
        if (item.readAt) continue;
        for (const tab of INBOX_TABS) if (isInTab(item, tab)) counts[tab] += 1;
    }
    return counts;
};

/** Local midnight of the day `ms` falls on — the key of its date group. */
export const dayOf = (ms: number): number => {
    const date = new Date(ms);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
};

export interface InboxViewOptions {
    tab: InboxTab;
    unreadOnly: boolean;
    sort: InboxSort;
    /**
     * An item the unread filter keeps although it is read: the one just opened, which stays in view
     * for a moment so the reader sees where they went before it leaves the list.
     */
    keepId?: string | null;
}

export interface InboxGroup {
    day: number;
    items: MentionItem[];
}

/**
 * What the panel lists: the tab's items, unread only when the filter is on, in date groups.
 *
 * The days run newest first except under "oldest first", which turns days and items around
 * together. "Unread first" keeps the days newest first and lifts a day's unread items above its
 * read ones, so a day heading is never drawn twice.
 */
export const inboxView = (items: MentionItem[], { tab, unreadOnly, sort, keepId }: InboxViewOptions): InboxGroup[] => {
    const listed = items.filter(item => isInTab(item, tab) && (!unreadOnly || !item.readAt || item.id === keepId));
    const direction = sort === 'oldest' ? 1 : -1;
    listed.sort((a, b) => {
        if (sort === 'unread') {
            const dayOrder = dayOf(b.createdAt) - dayOf(a.createdAt);
            if (dayOrder !== 0) return dayOrder;
            const unreadOrder = Number(!b.readAt) - Number(!a.readAt);
            if (unreadOrder !== 0) return unreadOrder;
        }
        return direction * (a.createdAt - b.createdAt);
    });
    const groups: InboxGroup[] = [];
    for (const item of listed) {
        const day = dayOf(item.createdAt);
        const last = groups[groups.length - 1];
        if (last?.day === day) last.items.push(item);
        else groups.push({ day, items: [item] });
    }
    return groups;
};
