import { create } from 'zustand';

interface InviteLinkState {
    link: string | null;
    open: (link: string) => void;
    close: () => void;
}

export const useInviteLinkStore = create<InviteLinkState>(set => ({
    link: null,
    open: link => set({ link }),
    close: () => set({ link: null }),
}));
