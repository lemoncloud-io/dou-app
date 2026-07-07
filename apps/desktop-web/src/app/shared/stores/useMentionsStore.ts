import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
}

/** Bound storage: keep only the newest N mentions. */
const MAX_ITEMS = 200;

interface MentionsState {
    items: Record<string, MentionItem>;
    add: (item: Omit<MentionItem, 'readAt'>) => void;
    markRead: (id: string) => void;
    markAllRead: () => void;
    remove: (id: string) => void;
}

/** Count of unread mentions — drives the sidebar Activity dot. */
export const unreadMentionCount = (items: Record<string, MentionItem>): number =>
    Object.values(items).reduce((count, item) => (item.readAt ? count : count + 1), 0);

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

interface MentionsPanelState {
    isOpen: boolean;
    open: () => void;
    close: () => void;
}

/** Whether the trailing Activity pane is open (HomePage enforces pane exclusivity). */
export const useMentionsPanelStore = create<MentionsPanelState>(set => ({
    isOpen: false,
    open: () => set({ isOpen: true }),
    close: () => set({ isOpen: false }),
}));
