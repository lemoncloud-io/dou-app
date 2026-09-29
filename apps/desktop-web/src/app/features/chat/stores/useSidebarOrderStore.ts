import { create } from 'zustand';

interface SidebarOrderState {
    /** Channel ids in the order the sidebar draws them, unfiltered: favourites, channels, DMs. */
    ids: string[];
    setIds: (ids: string[]) => void;
}

/**
 * The sidebar's drawing order, written by ChannelList and read by the next-unread
 * shortcut. Kept outside the list because the list unmounts while the narrow-window
 * drawer is shut, and the shortcut has to work then too.
 */
export const useSidebarOrderStore = create<SidebarOrderState>((set, get) => ({
    ids: [],
    setIds: ids => {
        const current = get().ids;
        if (current.length === ids.length && current.every((id, i) => id === ids[i])) return;
        set({ ids });
    },
}));
