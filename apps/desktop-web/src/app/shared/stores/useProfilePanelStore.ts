import { create } from 'zustand';

export interface ProfilePanelTarget {
    userId: string;
    fallbackName?: string;
    fallbackThumbnail?: string;
    colorSeed?: string;
    isOwner?: boolean;
    isMe?: boolean;
}

interface ProfilePanelState {
    target: ProfilePanelTarget | null;
    open: (target: ProfilePanelTarget) => void;
    close: () => void;
}

export const useProfilePanelStore = create<ProfilePanelState>(set => ({
    target: null,
    open: target => set({ target }),
    close: () => set({ target: null }),
}));
