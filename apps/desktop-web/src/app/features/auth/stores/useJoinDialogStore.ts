import { create } from 'zustand';

interface JoinDialogState {
    isOpen: boolean;
    open: () => void;
    close: () => void;
}

export const useJoinDialogStore = create<JoinDialogState>(set => ({
    isOpen: false,
    open: () => set({ isOpen: true }),
    close: () => set({ isOpen: false }),
}));
