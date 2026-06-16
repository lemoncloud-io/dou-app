import { create } from 'zustand';

interface JoinDialogState {
    isOpen: boolean;
    open: () => void;
    close: () => void;
}

/**
 * Global UI state: whether the in-app "join a workspace" invite dialog is showing.
 * Lives in Zustand because the trigger (cloud rail menu) and the dialog itself are
 * rendered in different parts of the tree.
 */
export const useJoinDialogStore = create<JoinDialogState>(set => ({
    isOpen: false,
    open: () => set({ isOpen: true }),
    close: () => set({ isOpen: false }),
}));
