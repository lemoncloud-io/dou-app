import { create } from 'zustand';

interface ChannelSettingsState {
    /** Channel whose settings panel is open, or null when closed. */
    openChannelId: string | null;
    /** Part of the panel to bring into view on open; the header's member chip asks for the members. */
    focus: 'members' | null;
    open: (channelId: string, focus?: 'members') => void;
    close: () => void;
}

/**
 * Global UI state: which channel's settings panel is open. Lives in Zustand
 * because the trigger (ChatPane header kebab) and the panel itself are rendered
 * in different parts of the tree.
 */
export const useChannelSettingsStore = create<ChannelSettingsState>(set => ({
    openChannelId: null,
    focus: null,
    open: (channelId, focus) => set({ openChannelId: channelId, focus: focus ?? null }),
    close: () => set({ openChannelId: null, focus: null }),
}));
