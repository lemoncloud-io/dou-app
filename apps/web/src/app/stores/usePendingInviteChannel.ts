import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { persistStorageOver, tabStore } from '../storage';

interface PendingInviteChannelState {
    channelId: string | null;
    setPendingChannel: (channelId: string) => void;
    clearPendingChannel: () => void;
}

export const usePendingInviteChannel = create<PendingInviteChannelState>()(
    persist(
        set => ({
            channelId: null,
            setPendingChannel: channelId => set({ channelId }),
            clearPendingChannel: () => set({ channelId: null }),
        }),
        {
            name: 'chatic.invite.pending-channel',
            storage: persistStorageOver(tabStore),
            partialize: state => ({ channelId: state.channelId }),
        }
    )
);
