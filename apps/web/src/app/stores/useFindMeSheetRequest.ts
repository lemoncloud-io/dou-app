import { create } from 'zustand';

interface FindMeSheetRequestState {
    open: boolean;
    request: () => void;
    close: () => void;
}

/**
 * Asks for the find-me sheet — the unread mentions and replies looking for the reader. Home raises
 * it from its entry row; the private shell mounts the notifications feature's host that answers it,
 * because a feature does not import another.
 */
export const useFindMeSheetRequest = create<FindMeSheetRequestState>(set => ({
    open: false,
    request: () => set({ open: true }),
    close: () => set({ open: false }),
}));
