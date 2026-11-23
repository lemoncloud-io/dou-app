import { create } from 'zustand';

interface EditPlaceProfileDialogState {
    isOpen: boolean;
    open: () => void;
    close: () => void;
}

export const useEditPlaceProfileDialogStore = create<EditPlaceProfileDialogState>(set => ({
    isOpen: false,
    open: () => set({ isOpen: true }),
    close: () => set({ isOpen: false }),
}));
