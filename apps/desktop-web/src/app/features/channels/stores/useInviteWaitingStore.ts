import { create } from 'zustand';

interface InviteWaitingState {
    /** The invite under watch; null = dialog closed. */
    inviteId: string | null;
    /** Recipient memory for reissue (the create response + sender input). */
    phone: string;
    name: string;
    /** The shareable link, for the copy button (memory only, never persisted). */
    deeplink: string;
    channelId?: string;
    open: (invite: { inviteId: string; phone: string; name: string; deeplink?: string; channelId?: string }) => void;
    close: () => void;
}

/**
 * Global UI state for the sent-invite waiting dialog. The trigger (a
 * successful send) and the dialog render in different parts of the tree, and
 * the dialog re-opens onto a reissued invite by switching `inviteId` in place.
 */
export const useInviteWaitingStore = create<InviteWaitingState>(set => ({
    inviteId: null,
    phone: '',
    name: '',
    deeplink: '',
    channelId: undefined,
    open: invite => set({ ...invite }),
    close: () => set({ inviteId: null, phone: '', name: '', deeplink: '', channelId: undefined }),
}));
