import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/**
 * Transient hand-off for the invite-accept flow: the room to open once the accept screen is gone.
 * Both accept lanes stash the invited channel here and then leave the accept screen by rewinding;
 * `useOpenPendingInviteChannel`, mounted in the layout, consumes the id on whatever screen that lands
 * on and enters the room there. There is no place-profile gate in between.
 *
 * Kept in sessionStorage, not only in memory, because the rewind is not always a same-document hop.
 * The native shell reloads the WebView when the OS kills its web process, which a reader waiting for
 * an SMS code in another app can easily cause. After that reload the entries behind the accept
 * screen belong to a document that is gone, so the rewind is a full page load and would take an
 * in-memory id with it. sessionStorage is scoped to the tab and outlives both the reload and that
 * load, and the id is removed as soon as it is consumed.
 */
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
            storage: createJSONStorage(() => sessionStorage),
            partialize: state => ({ channelId: state.channelId }),
        }
    )
);
