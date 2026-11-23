import { create } from 'zustand';

interface FindMeSheetRequestState {
    open: boolean;
    request: () => void;
    close: () => void;
}

export const useFindMeSheetRequest = create<FindMeSheetRequestState>(set => ({
    open: false,
    request: () => set({ open: true }),
    close: () => set({ open: false }),
}));
