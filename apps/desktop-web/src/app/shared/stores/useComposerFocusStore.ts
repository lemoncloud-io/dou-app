import { create } from 'zustand';

interface ComposerFocusState {
    removedId: string | null;
    skipNext: boolean;
    request: (removedId: string) => void;
    consume: () => void;
    requestSkip: () => void;
    clearSkip: () => void;
}

export const useComposerFocusStore = create<ComposerFocusState>(set => ({
    removedId: null,
    skipNext: false,
    request: removedId => set({ removedId }),
    consume: () => set({ removedId: null }),
    requestSkip: () => set({ skipNext: true }),
    clearSkip: () => set({ skipNext: false }),
}));
