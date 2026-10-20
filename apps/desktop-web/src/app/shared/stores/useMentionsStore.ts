import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { isMentionKind, type InboxKind, type InboxSort, type InboxTab } from '../utils/inboxKinds';

/**
 * A message that @-mentioned me, snapshotted at capture time. Snapshot (not a
 * live ref) because the source row pages out of the chat cache; the Activity
 * list must still render it. Mirrors SavedItem, plus a read marker.
 */
export interface MentionItem {
    /** The message's id — also the dedupe key (a mention is captured once). */
    id: string;
    channelId: string;
    chatNo?: number;
    content: string;
    ownerName: string;
    avatar?: string;
    colorSeed?: string;
    ownerId?: string;
    /** Place the message belongs to — groups the list + drives cross-place jump. */
    placeId?: string;
    /** Root chatNo string when this message is a thread reply; absent = top-level. */
    parentId?: string;
    createdAt: number;
    /** Epoch ms when read; absent = unread (drives the Activity badge). */
    readAt?: number;
    /**
     * Why the item is here (`inboxKinds.ts`). Absent on items stored before the inbox took DMs,
     * replies and reactions; those read as `direct`.
     */
    kind?: InboxKind;
    /** The emoji of a `reaction` item; its `content` is the message reacted to. */
    emoji?: string;
    /** Set when the message was in a 1:1 — a `dm` item says so by kind, a reaction only here. */
    inDm?: boolean;
    /** The channel's name when the item was captured: its place's channels may not be loaded when it is read. */
    channelName?: string;
}

/** Bound storage: keep only the newest N items. DMs, replies and reactions share the cap with mentions. */
const MAX_ITEMS = 500;

/**
 * What the inbox keeps of a message: the two-line preview, not the body. Full
 * text at 200 rows persisted and rewritten on every mark — the row only ever
 * shows a clamped preview.
 */
export const MENTION_PREVIEW_CHARS = 240;

/** Trim to the preview the row renders — a whole tail the reader never sees is not stored. */
export const truncateMentionPreview = (content: string): string =>
    content.length > MENTION_PREVIEW_CHARS ? content.slice(0, MENTION_PREVIEW_CHARS) : content;

interface MentionsState {
    items: Record<string, MentionItem>;
    add: (item: Omit<MentionItem, 'readAt'>) => void;
    markRead: (id: string) => void;
    markAllRead: () => void;
    /**
     * Stamp every unread item of a channel at or below `chatNo` read — the
     * inbox follows the same read-cursor boundary as the row and the dock, so
     * reading in the channel (or on another device, via the synced cursor)
     * clears the inbox without opening each item. The place disambiguates
     * same-id channels of other places; items captured before placeId existed
     * match any place.
     */
    markChannelRead: (channelId: string, chatNo: number, placeId?: string) => void;
    remove: (id: string) => void;
}

/** Count of unread mentions — drives the sidebar Activity dot. Other kinds do not count. */
export const unreadMentionCount = (items: Record<string, MentionItem>): number =>
    Object.values(items).reduce((count, item) => (item.readAt || !isMentionKind(item) ? count : count + 1), 0);

/**
 * Whether a channel holds a mention I have not got to: one not opened from the inbox, and past
 * `readNo`, what I have read in the channel. Drives the `@` on the channel's row.
 *
 * The channel is named with its place: channel ids are numbered per place, and this inbox holds
 * every place's mentions, so the id alone would also match another place's channel.
 */
const isUnreadMentionIn = (item: MentionItem, channel: { id: string; placeId?: string }, readNo: number): boolean =>
    isMentionKind(item) &&
    item.channelId === channel.id &&
    item.placeId === channel.placeId &&
    !item.readAt &&
    (item.chatNo ?? 0) > readNo;

export const hasUnreadMentionIn = (
    items: Record<string, MentionItem>,
    channel: { id: string; placeId?: string },
    readNo: number
): boolean => Object.values(items).some(item => isUnreadMentionIn(item, channel, readNo));

/**
 * How many unread mentions a channel holds — the same condition as
 * `hasUnreadMentionIn`, as a count. Drives the dock and place totals for
 * mentions-only channels (`placeUnreadCounts` caps it at the channel's unread).
 */
export const countUnreadMentionsIn = (
    items: Record<string, MentionItem>,
    channel: { id: string; placeId?: string },
    readNo: number
): number =>
    Object.values(items).reduce((count, item) => (isUnreadMentionIn(item, channel, readNo) ? count + 1 : count), 0);

/**
 * Device-local mentions inbox ("Activity"). No server mention model exists, so
 * this is a local snapshot like Saved items — persisted to localStorage, does
 * not follow the account across devices.
 */
export const useMentionsStore = create<MentionsState>()(
    persist(
        set => ({
            items: {},
            add: item =>
                set(state => {
                    // Already captured — never re-add (resync redelivery, dup events).
                    if (state.items[item.id]) return state;
                    const next: Record<string, MentionItem> = { ...state.items, [item.id]: item };
                    const ids = Object.keys(next);
                    if (ids.length > MAX_ITEMS) {
                        // Evict oldest by createdAt down to the cap.
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
            markAllRead: () =>
                set(state => {
                    const now = Date.now();
                    const next: Record<string, MentionItem> = {};
                    for (const [id, item] of Object.entries(state.items)) {
                        next[id] = item.readAt ? item : { ...item, readAt: now };
                    }
                    return { items: next };
                }),
            markChannelRead: (channelId, chatNo, placeId) =>
                set(state => {
                    if (!channelId || !chatNo) return state;
                    let touched = false;
                    const now = Date.now();
                    const next: Record<string, MentionItem> = {};
                    for (const [id, item] of Object.entries(state.items)) {
                        const samePlace = placeId == null || item.placeId == null || item.placeId === placeId;
                        if (!item.readAt && item.channelId === channelId && samePlace && (item.chatNo ?? 0) <= chatNo) {
                            next[id] = { ...item, readAt: now };
                            touched = true;
                        } else {
                            next[id] = item;
                        }
                    }
                    return touched ? { items: next } : state;
                }),
            remove: id =>
                set(state => {
                    const next = { ...state.items };
                    delete next[id];
                    return { items: next };
                }),
        }),
        { name: 'chatic-mentions' }
    )
);

interface NotificationsPanelState {
    /** The item last opened from the panel: its card stays marked as where the reader went. */
    openedId: string | null;
    tab: InboxTab;
    unreadOnly: boolean;
    sort: InboxSort;
    /**
     * The cloud whose cached messages are being read for threads on its first launch. Until it is
     * done an empty Threads tab is not final, and says so.
     */
    scanningCid: string | null;
    markOpened: (id: string) => void;
    setTab: (tab: InboxTab) => void;
    setUnreadOnly: (unreadOnly: boolean) => void;
    setSort: (sort: InboxSort) => void;
    setScanning: (cid: string | null) => void;
}

/**
 * The Notifications panel's view, in memory: the panel unmounts whenever the nav leaves it, and
 * coming back finds the same tab, filter and order.
 */
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
