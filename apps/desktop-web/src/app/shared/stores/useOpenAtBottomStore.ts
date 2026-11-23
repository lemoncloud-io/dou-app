import { create } from 'zustand';

interface OpenAtBottomState {
    channelId: string | null;
    request: (channelId: string) => void;
    clear: () => void;
}

export const useOpenAtBottomStore = create<OpenAtBottomState>(set => ({
    channelId: null,
    request: channelId => set({ channelId }),
    clear: () => set({ channelId: null }),
}));
