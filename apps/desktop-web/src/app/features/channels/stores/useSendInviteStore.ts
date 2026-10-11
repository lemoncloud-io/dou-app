import { create } from 'zustand';

interface SendInviteState {
    /** The channel the invite enters; null = dialog closed. */
    channelId: string | null;
    channelName: string;
    open: (channelId: string, channelName: string) => void;
    close: () => void;
}

/**
 * Global UI state for the invite sender dialog. Lives in Zustand because the
 * trigger (a channel row menu) and the dialog itself render in different parts
 * of the tree — the same split as the join dialog (`useJoinDialogStore`).
 */
export const useSendInviteStore = create<SendInviteState>(set => ({
    channelId: null,
    channelName: '',
    open: (channelId, channelName) => set({ channelId, channelName }),
    close: () => set({ channelId: null, channelName: '' }),
}));
