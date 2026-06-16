import { create } from 'zustand';

interface EditPlaceProfileDialogState {
    isOpen: boolean;
    open: () => void;
    close: () => void;
}

/**
 * Global UI state: whether the "edit my place profile" dialog is showing. Lives
 * in Zustand because the trigger (CloudRail menu) and the dialog (rendered in
 * HomePage) sit in different parts of the tree.
 */
export const useEditPlaceProfileDialogStore = create<EditPlaceProfileDialogState>(set => ({
    isOpen: false,
    open: () => set({ isOpen: true }),
    close: () => set({ isOpen: false }),
}));
