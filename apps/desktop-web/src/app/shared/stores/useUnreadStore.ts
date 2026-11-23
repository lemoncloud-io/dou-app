import { create } from 'zustand';

interface UnreadState {
    byPlace: Record<string, number>;
    total: number;
    setUnread: (unread: { byPlace: Record<string, number>; total: number }) => void;
}

export const useUnreadStore = create<UnreadState>(set => ({
    byPlace: {},
    total: 0,
    setUnread: ({ byPlace, total }) => set({ byPlace, total }),
}));
