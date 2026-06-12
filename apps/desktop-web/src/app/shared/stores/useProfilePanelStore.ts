import { create } from 'zustand';

/** Identity snapshot the trigger surface rendered — mirrors UserProfilePopover props. */
export interface ProfilePanelTarget {
    userId: string;
    fallbackName?: string;
    fallbackThumbnail?: string;
    colorSeed?: string;
    isOwner?: boolean;
    /** The signed-in user's own card — hides actions like "Message". */
    isMe?: boolean;
}

interface ProfilePanelState {
    /** The user whose full-profile panel is open, or null when closed. */
    target: ProfilePanelTarget | null;
    open: (target: ProfilePanelTarget) => void;
    close: () => void;
}

/**
 * Global UI state: which user's profile panel is open. Lives in Zustand because
 * the trigger (the profile card popover, anywhere in the tree) and the panel
 * (rendered by HomePage in the trailing pane) sit in different parts of the
 * tree — mirrors useThreadStore / useChannelSettingsStore. The trailing-pane
 * owners are mutually exclusive; HomePage enforces it.
 */
export const useProfilePanelStore = create<ProfilePanelState>(set => ({
    target: null,
    open: target => set({ target }),
    close: () => set({ target: null }),
}));
