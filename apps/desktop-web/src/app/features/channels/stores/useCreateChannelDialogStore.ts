import { create } from 'zustand';

interface CreateChannelDialogState {
    isOpen: boolean;
    open: () => void;
    close: () => void;
}

export const useCreateChannelDialogStore = create<CreateChannelDialogState>(set => ({
    isOpen: false,
    open: () => set({ isOpen: true }),
    close: () => set({ isOpen: false }),
}));
