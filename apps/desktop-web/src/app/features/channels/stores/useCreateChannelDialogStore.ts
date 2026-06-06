import { create } from 'zustand';

interface CreateChannelDialogState {
    isOpen: boolean;
    open: () => void;
    close: () => void;
}

/**
 * Global UI state: whether the "create channel" dialog is showing. Lives in
 * Zustand because the trigger (place rail "+") and the dialog itself are
 * rendered in different parts of the tree.
 */
export const useCreateChannelDialogStore = create<CreateChannelDialogState>(set => ({
    isOpen: false,
    open: () => set({ isOpen: true }),
    close: () => set({ isOpen: false }),
}));
