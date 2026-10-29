import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { ChatAttachmentKind } from '@chatic/data';

/** What a saved message carried, snapshotted with it: the Files filter and the card's file tile read it. */
export interface SavedAttachment {
    kind: ChatAttachmentKind;
    count: number;
    /** The first file's name and size, where the message had a named one. */
    name?: string;
    size?: number;
}

/**
 * A bookmarked message, snapshotted at save time. Snapshot (not a live ref)
 * because the source row can page out of the chat cache; the saved list must
 * still render it.
 */
export interface SavedItem {
    /** The message's id (or optimistic fallback) — also the toggle key. */
    id: string;
    channelId: string;
    chatNo?: number;
    content: string;
    ownerName: string;
    /** Author identity, snapshotted so saved rows render the feed's avatar. */
    avatar?: string;
    colorSeed?: string;
    ownerId?: string;
    /** Place the message belongs to — groups the list + drives cross-place jump. */
    placeId?: string;
    /** Root chatNo string when this message is a thread reply; absent = top-level. */
    parentId?: string;
    /** When the message was sent; absent on items saved before it was kept. */
    sentAt?: number;
    /** Absent when the message carried nothing, or was saved before attachments were kept. */
    attachment?: SavedAttachment;
    savedAt: number;
}

interface SavedItemsState {
    items: Record<string, SavedItem>;
    toggle: (item: Omit<SavedItem, 'savedAt'>) => void;
    remove: (id: string) => void;
}

/**
 * Device-local "Saved items" (Slack's Later, without server sync — the backend
 * has no bookmark model). Persisted to localStorage; survives reloads, does not
 * follow the account across devices.
 */
export const useSavedItemsStore = create<SavedItemsState>()(
    persist(
        set => ({
            items: {},
            toggle: item =>
                set(state => {
                    const next = { ...state.items };
                    if (next[item.id]) delete next[item.id];
                    else next[item.id] = { ...item, savedAt: Date.now() };
                    return { items: next };
                }),
            remove: id =>
                set(state => {
                    const next = { ...state.items };
                    delete next[id];
                    return { items: next };
                }),
        }),
        { name: 'chatic-saved-items' }
    )
);

/** The pages that take the main pane in place of a conversation. */
export type MainPanePage = 'saved' | 'threads';

interface SavedPageState {
    isOpen: boolean;
    /** Which page holds the main pane while `isOpen`. */
    page: MainPanePage;
    /** The card last opened from the page; marked when the page opens again. */
    openedId: string | null;
    open: (page?: MainPanePage) => void;
    close: () => void;
    markOpened: (id: string) => void;
}

/**
 * Whether a page — Saved items or Threads — holds the main pane (HomePage closes it when a conversation
 * opens). One store for both, so every move that leaves the Saved page leaves the Threads page too.
 */
export const useSavedPageStore = create<SavedPageState>(set => ({
    isOpen: false,
    page: 'saved',
    openedId: null,
    open: (page = 'saved') => set({ isOpen: true, page }),
    close: () => set({ isOpen: false }),
    markOpened: id => set({ openedId: id }),
}));
