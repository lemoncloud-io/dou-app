import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { isMentionKind, type InboxKind, type InboxSort, type InboxTab } from '../utils/inboxKinds';
import { deviceStore, persistStorageOver } from '../../storage';

export interface MentionItem {
    id: string;
    cloudId: string;
    channelId: string;
    chatNo?: number;
    content: string;
    ownerName: string;
    avatar?: string;
    colorSeed?: string;
    ownerId?: string;
    placeId?: string;
    parentId?: string;
    createdAt: number;
    readAt?: number;
    kind?: InboxKind;
    emoji?: string;
    inDm?: boolean;
    channelName?: string;
}

const MAX_ITEMS = 500;

export const MENTION_PREVIEW_CHARS = 240;

export const truncateMentionPreview = (content: string): string =>
    content.length > MENTION_PREVIEW_CHARS ? content.slice(0, MENTION_PREVIEW_CHARS) : content;

export const inboxItemId = (cloudId: string, id: string): string => `${cloudId}:${id}`;

export interface InboxChannelRef {
    cloudId: string;
    id: string;
    placeId?: string;
}

interface MentionsState {
    items: Record<string, MentionItem>;
    add: (item: Omit<MentionItem, 'readAt'>) => void;
    markRead: (id: string) => void;
    markManyRead: (ids: readonly string[]) => string[];
    markUnread: (ids: readonly string[]) => void;
    markChannelRead: (channel: InboxChannelRef, chatNo: number) => void;
    removeMany: (ids: readonly string[]) => void;
}

const isUnreadMentionIn = (item: MentionItem, channel: InboxChannelRef, readNo: number): boolean =>
    isMentionKind(item) &&
    item.cloudId === channel.cloudId &&
    item.channelId === channel.id &&
    item.placeId === channel.placeId &&
    !item.readAt &&
    (item.chatNo ?? 0) > readNo;

export const hasUnreadMentionIn = (
    items: Record<string, MentionItem>,
    channel: InboxChannelRef,
    readNo: number
): boolean => Object.values(items).some(item => isUnreadMentionIn(item, channel, readNo));

export const keepCloudItems = (persisted: unknown): { items: Record<string, MentionItem> } => {
    const items = (persisted as { items?: Record<string, Partial<MentionItem>> } | null)?.items ?? {};
    return {
        items: Object.fromEntries(
            Object.entries(items).filter((entry): entry is [string, MentionItem] => !!entry[1]?.cloudId)
        ),
    };
};

export const useMentionsStore = create<MentionsState>()(
    persist(
        (set, get) => ({
            items: {},
            add: item =>
                set(state => {
                    if (state.items[item.id]) return state;
                    const next: Record<string, MentionItem> = { ...state.items, [item.id]: item };
                    const ids = Object.keys(next);
                    if (ids.length > MAX_ITEMS) {
                        const oldestFirst = ids.sort((a, b) => next[a].createdAt - next[b].createdAt);
                        for (const id of oldestFirst.slice(0, ids.length - MAX_ITEMS)) delete next[id];
                    }
                    return { items: next };
                }),
            markRead: id =>
                set(state => {
                    const target = state.items[id];
                    if (!target || target.readAt) return state;
                    return { items: { ...state.items, [id]: { ...target, readAt: Date.now() } } };
                }),
            markManyRead: ids => {
                const { items } = get();
                const changed = ids.filter(id => items[id] && !items[id].readAt);
                if (changed.length === 0) return changed;
                const now = Date.now();
                const next = { ...items };
                for (const id of changed) next[id] = { ...items[id], readAt: now };
                set({ items: next });
                return changed;
            },
            markUnread: ids =>
                set(state => {
                    const present = ids.filter(id => state.items[id]?.readAt);
                    if (present.length === 0) return state;
                    const next = { ...state.items };
                    for (const id of present) next[id] = { ...state.items[id], readAt: undefined };
                    return { items: next };
                }),
            markChannelRead: ({ cloudId, id: channelId, placeId }, chatNo) =>
                set(state => {
                    if (!channelId || !chatNo) return state;
                    let touched = false;
                    const now = Date.now();
                    const next: Record<string, MentionItem> = {};
                    for (const [id, item] of Object.entries(state.items)) {
                        const samePlace = placeId == null || item.placeId == null || item.placeId === placeId;
                        if (
                            !item.readAt &&
                            item.cloudId === cloudId &&
                            item.channelId === channelId &&
                            samePlace &&
                            (item.chatNo ?? 0) <= chatNo
                        ) {
                            next[id] = { ...item, readAt: now };
                            touched = true;
                        } else {
                            next[id] = item;
                        }
                    }
                    return touched ? { items: next } : state;
                }),
            removeMany: ids =>
                set(state => {
                    const next = { ...state.items };
                    for (const id of ids) delete next[id];
                    return { items: next };
                }),
        }),
        { name: 'chatic-mentions', storage: persistStorageOver(deviceStore), version: 1, migrate: keepCloudItems }
    )
);

interface NotificationsPanelState {
    openedId: string | null;
    tab: InboxTab;
    unreadOnly: boolean;
    sort: InboxSort;
    scanningCid: string | null;
    markOpened: (id: string) => void;
    setTab: (tab: InboxTab) => void;
    setUnreadOnly: (unreadOnly: boolean) => void;
    setSort: (sort: InboxSort) => void;
    setScanning: (cid: string | null) => void;
}

export const useNotificationsPanelStore = create<NotificationsPanelState>(set => ({
    openedId: null,
    tab: 'all',
    unreadOnly: false,
    sort: 'newest',
    scanningCid: null,
    markOpened: id => set({ openedId: id }),
    setTab: tab => set({ tab }),
    setUnreadOnly: unreadOnly => set({ unreadOnly }),
    setSort: sort => set({ sort }),
    setScanning: cid => set({ scanningCid: cid }),
}));
