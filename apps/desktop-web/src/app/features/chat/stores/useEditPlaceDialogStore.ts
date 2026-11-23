import { create } from 'zustand';

interface EditPlaceDialogState {
    placeId: string | null;
    open: (placeId: string) => void;
    close: () => void;
}

export const useEditPlaceDialogStore = create<EditPlaceDialogState>(set => ({
    placeId: null,
    open: placeId => set({ placeId }),
    close: () => set({ placeId: null }),
}));
