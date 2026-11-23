import { create } from 'zustand';

export type SendInviteTarget =
    | { kind: 'channel'; id: string; name: string }
    | { kind: 'place'; id: string; name: string };

interface SendInviteState {
    target: SendInviteTarget | null;
    open: (channelId: string, channelName: string) => void;
    openPlace: (placeId: string, placeName: string) => void;
    close: () => void;
}

export const useSendInviteStore = create<SendInviteState>(set => ({
    target: null,
    open: (channelId, channelName) => set({ target: { kind: 'channel', id: channelId, name: channelName } }),
    openPlace: (placeId, placeName) => set({ target: { kind: 'place', id: placeId, name: placeName } }),
    close: () => set({ target: null }),
}));
