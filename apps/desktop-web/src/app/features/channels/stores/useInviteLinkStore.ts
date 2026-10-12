import { create } from 'zustand';

interface InviteLinkState {
    /** The shareable link on display; null = dialog closed. */
    link: string | null;
    open: (link: string) => void;
    close: () => void;
}

/**
 * Global UI state for the place-invite link dialog. The trigger (a
 * successful place-bound send) and the dialog render in different parts of
 * the tree. The link is shareable by design, so holding it in memory is safe;
 * it is never persisted.
 */
export const useInviteLinkStore = create<InviteLinkState>(set => ({
    link: null,
    open: link => set({ link }),
    close: () => set({ link: null }),
}));
