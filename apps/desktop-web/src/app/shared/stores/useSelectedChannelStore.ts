import { create } from 'zustand';

interface SelectedChannelState {
    selectedChannelId: string | null;
    selectChannel: (channelId: string) => void;
    clearChannel: () => void;
}

/**
 * Global client state: which channel is currently open in the right pane.
 * Lives in Zustand (not useState) because both panes read/write it.
 */
export const useSelectedChannelStore = create<SelectedChannelState>(set => ({
    selectedChannelId: null,
    selectChannel: channelId => set({ selectedChannelId: channelId }),
    clearChannel: () => set({ selectedChannelId: null }),
}));
