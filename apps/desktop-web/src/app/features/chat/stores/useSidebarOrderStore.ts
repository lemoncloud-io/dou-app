import { create } from 'zustand';

interface SidebarOrderState {
    ids: string[];
    setIds: (ids: string[]) => void;
}

export const useSidebarOrderStore = create<SidebarOrderState>((set, get) => ({
    ids: [],
    setIds: ids => {
        const current = get().ids;
        if (current.length === ids.length && current.every((id, i) => id === ids[i])) return;
        set({ ids });
    },
}));
