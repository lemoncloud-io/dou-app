import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { deviceStore, persistStorageOver } from '../../storage';

interface SelectedChannelState {
    selectedChannelId: string | null;
    selectChannel: (channelId: string) => void;
    clearChannel: () => void;
    clearIfOpen: (channelId: string | null) => void;
}

export const useSelectedChannelStore = create<SelectedChannelState>()(
    persist(
        set => ({
            selectedChannelId: null,
            selectChannel: channelId => set({ selectedChannelId: channelId }),
            clearChannel: () => set({ selectedChannelId: null }),
            clearIfOpen: channelId =>
                set(s => (channelId && s.selectedChannelId === channelId ? { selectedChannelId: null } : s)),
        }),
        { name: 'chatic-selected-channel', storage: persistStorageOver(deviceStore) }
    )
);
