import {
    INBOX_TABS,
    inboxKindOf,
    isMentionKind,
    type InboxSort,
    type InboxTab,
    type MentionItem,
} from '../../../../shared';

export type InboxSource = 'channel' | 'dm' | 'thread';

export const inboxSource = (item: Pick<MentionItem, 'kind' | 'parentId' | 'inDm'>): InboxSource => {
    if (item.parentId) return 'thread';
    const kind = inboxKindOf(item);
    if (kind === 'dm' || (kind === 'reaction' && item.inDm)) return 'dm';
    return 'channel';
};

export const isInTab = (item: MentionItem, tab: InboxTab): boolean => {
    if (tab === 'all') return true;
    if (tab === 'mention') return isMentionKind(item);
    return inboxSource(item) === tab;
};

export const inboxTabCounts = (items: MentionItem[]): Record<InboxTab, number> => {
    const counts: Record<InboxTab, number> = { all: 0, channel: 0, dm: 0, thread: 0, mention: 0 };
    for (const item of items) {
        if (item.readAt) continue;
        for (const tab of INBOX_TABS) if (isInTab(item, tab)) counts[tab] += 1;
    }
    return counts;
};

export const dayOf = (ms: number): number => {
    const date = new Date(ms);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
};

export interface InboxViewOptions {
    tab: InboxTab;
    unreadOnly: boolean;
    sort: InboxSort;
    keepId?: string | null;
}

export interface InboxGroup {
    day: number;
    items: MentionItem[];
}

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
