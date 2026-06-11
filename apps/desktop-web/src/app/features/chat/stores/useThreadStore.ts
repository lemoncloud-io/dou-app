import { create } from 'zustand';

interface ThreadState {
    /** Thread root id whose panel is open, or null when closed. */
    openRootId: string | null;
    open: (rootId: string) => void;
    close: () => void;
}

/**
 * Global UI state: which thread's panel is open. Lives in Zustand because the
 * trigger (a message row's reply action) and the panel (rendered by HomePage in
 * the trailing pane) sit in different parts of the tree — mirrors
 * useChannelSettingsStore. The two share the trailing pane and are mutually
 * exclusive; HomePage enforces it.
 */
export const useThreadStore = create<ThreadState>(set => ({
    openRootId: null,
    open: rootId => set({ openRootId: rootId }),
    close: () => set({ openRootId: null }),
}));
