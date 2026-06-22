import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SelectedChannelState {
    selectedChannelId: string | null;
    selectChannel: (channelId: string) => void;
    clearChannel: () => void;
}

/**
 * Global client state: which channel is currently open in the right pane.
 * Lives in Zustand (not useState) because both panes read/write it.
 *
 * Persisted so a refresh reopens the last channel instead of snapping back to
 * the first one. Synchronous localStorage hydration means the id is present
 * before HomePage's auto-select effect runs; a channel that no longer exists in
 * the loaded place still self-heals there (the `!stillValid` first-channel
 * fallback). Account-scoped — cleared on logout via useAccountResetOnLogout.
 */
export const useSelectedChannelStore = create<SelectedChannelState>()(
    persist(
        set => ({
            selectedChannelId: null,
            selectChannel: channelId => set({ selectedChannelId: channelId }),
            clearChannel: () => set({ selectedChannelId: null }),
        }),
        { name: 'chatic-selected-channel' }
    )
);
