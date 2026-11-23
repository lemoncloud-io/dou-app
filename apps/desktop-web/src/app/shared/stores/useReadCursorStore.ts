import { create } from 'zustand';

interface ReadCursorState {
    cursors: Record<string, number>;
    markRead: (channelId: string, chatNo: number) => void;
}

export const useReadCursorStore = create<ReadCursorState>((set, get) => ({
    cursors: {},
    markRead: (channelId, chatNo) => {
        if (!channelId || !chatNo) return;
        if (chatNo <= (get().cursors[channelId] ?? 0)) return;
        set(state => ({ cursors: { ...state.cursors, [channelId]: chatNo } }));
    },
}));
