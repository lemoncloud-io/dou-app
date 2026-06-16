import { create } from 'zustand';

interface ChannelSettingsState {
    /** Channel whose settings panel is open, or null when closed. */
    openChannelId: string | null;
    open: (channelId: string) => void;
    close: () => void;
}

/**
 * Global UI state: which channel's settings panel is open. Lives in Zustand
 * because the trigger (ChatPane header kebab) and the panel itself are rendered
 * in different parts of the tree.
 */
export const useChannelSettingsStore = create<ChannelSettingsState>(set => ({
    openChannelId: null,
    open: channelId => set({ openChannelId: channelId }),
    close: () => set({ openChannelId: null }),
}));
