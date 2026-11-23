import { create } from 'zustand';

interface InviteWaitingState {
    inviteId: string | null;
    phone: string;
    name: string;
    deeplink: string;
    channelId?: string;
    open: (invite: { inviteId: string; phone: string; name: string; deeplink?: string; channelId?: string }) => void;
    close: () => void;
}

export const useInviteWaitingStore = create<InviteWaitingState>(set => ({
    inviteId: null,
    phone: '',
    name: '',
    deeplink: '',
    channelId: undefined,
    open: invite => set({ channelId: undefined, ...invite }),
    close: () => set({ inviteId: null, phone: '', name: '', deeplink: '', channelId: undefined }),
}));
