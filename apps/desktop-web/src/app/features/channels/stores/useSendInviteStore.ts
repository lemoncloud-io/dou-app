import { create } from 'zustand';

export type SendInviteTarget =
    | { kind: 'channel'; id: string; name: string }
    | { kind: 'place'; id: string; name: string };

interface SendInviteState {
    /** What the invite enters; null = dialog closed. */
    target: SendInviteTarget | null;
    open: (channelId: string, channelName: string) => void;
    openPlace: (placeId: string, placeName: string) => void;
    close: () => void;
}

/**
 * Global UI state for the invite sender dialog. Lives in Zustand because the
 * triggers (a channel row menu, a place rail menu) and the dialog itself
 * render in different parts of the tree — the same split as the join dialog
 * (`useJoinDialogStore`).
 */
export const useSendInviteStore = create<SendInviteState>(set => ({
    target: null,
    open: (channelId, channelName) => set({ target: { kind: 'channel', id: channelId, name: channelName } }),
    openPlace: (placeId, placeName) => set({ target: { kind: 'place', id: placeId, name: placeName } }),
    close: () => set({ target: null }),
}));
