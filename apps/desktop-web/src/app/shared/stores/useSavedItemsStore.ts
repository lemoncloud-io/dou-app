import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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

interface SavedPanelState {
    isOpen: boolean;
    open: () => void;
    close: () => void;
}

/** Whether the trailing Saved-items pane is open (HomePage enforces pane exclusivity). */
export const useSavedPanelStore = create<SavedPanelState>(set => ({
    isOpen: false,
    open: () => set({ isOpen: true }),
    close: () => set({ isOpen: false }),
}));
