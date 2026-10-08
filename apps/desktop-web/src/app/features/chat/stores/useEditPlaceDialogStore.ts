import { create } from 'zustand';

interface EditPlaceDialogState {
    /** The place being edited, or `null` while the dialog is closed. */
    placeId: string | null;
    open: (placeId: string) => void;
    close: () => void;
}

/** Which place the "edit place" dialog is showing: the place rail opens it, the home page renders it. */
export const useEditPlaceDialogStore = create<EditPlaceDialogState>(set => ({
    placeId: null,
    open: placeId => set({ placeId }),
    close: () => set({ placeId: null }),
}));
