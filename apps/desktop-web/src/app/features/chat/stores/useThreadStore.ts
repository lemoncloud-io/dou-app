import { create } from 'zustand';

interface ThreadState {
    openRootId: string | null;
    openChannelId: string | null;
    open: (rootId: string, channelId: string) => void;
    close: () => void;
}

export const useThreadStore = create<ThreadState>(set => ({
    openRootId: null,
    openChannelId: null,
    open: (rootId, channelId) => set({ openRootId: rootId, openChannelId: channelId }),
    close: () => set({ openRootId: null, openChannelId: null }),
}));
