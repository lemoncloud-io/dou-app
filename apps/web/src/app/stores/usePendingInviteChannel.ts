import { create } from 'zustand';

/**
 * Transient hand-off for the invite-accept flow: the channel to open once the invitee lands on home.
 * The accept pipeline routes through home (so the place connection settles there) and stashes the
 * invited channel here; HomePage consumes the id and navigates straight to the room — there is no
 * place-profile gate in between. Not persisted — it only bridges the accept → channel hop.
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
