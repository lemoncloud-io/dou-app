import { create } from 'zustand';

interface ThreadState {
    /** Thread root id whose panel is open, or null when closed. */
    openRootId: string | null;
    /** The channel the thread was opened in — a root id (a bare chatNo) means nothing without it. */
    openChannelId: string | null;
    open: (rootId: string, channelId: string) => void;
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
    openChannelId: null,
    open: (rootId, channelId) => set({ openRootId: rootId, openChannelId: channelId }),
    close: () => set({ openRootId: null, openChannelId: null }),
}));
