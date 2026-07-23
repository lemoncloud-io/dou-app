import { create } from 'zustand';

/**
 * Transient hand-off for the invite-accept flow: the channel to open AFTER the mandatory place
 * profile is set. The accept pipeline lands on home (so the profile gate can run) and stashes the
 * invited channel here; HomePage navigates to it once the profile exists (created just now, or
 * already present). Not persisted — it only bridges the accept → profile → channel hop.
 */
interface PendingInviteChannelState {
    channelId: string | null;
    setPendingChannel: (channelId: string) => void;
    clearPendingChannel: () => void;
}

export const usePendingInviteChannel = create<PendingInviteChannelState>(set => ({
    channelId: null,
    setPendingChannel: channelId => set({ channelId }),
    clearPendingChannel: () => set({ channelId: null }),
}));
