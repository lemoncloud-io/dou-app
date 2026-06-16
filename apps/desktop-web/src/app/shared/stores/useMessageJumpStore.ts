import { create } from 'zustand';

/**
 * A request to scroll the open channel's feed to a specific message and flash
 * it (saved-item / search jump). Transient — never persisted. Mirrors
 * usePendingOpenStore: the nonce lets a repeat jump to the same message re-fire.
 */
export interface MessageJumpTarget {
    channelId: string;
    chatNo: number;
    /** Bumped on each request so a repeat jump to the same message still fires. */
    nonce: number;
}

interface MessageJumpState {
    target: MessageJumpTarget | null;
    request: (channelId: string, chatNo: number) => void;
    clear: () => void;
}

/** Pending "scroll to this message" target for the open channel feed. */
export const useMessageJumpStore = create<MessageJumpState>((set, get) => ({
    target: null,
    request: (channelId, chatNo) => set({ target: { channelId, chatNo, nonce: (get().target?.nonce ?? 0) + 1 } }),
    clear: () => set({ target: null }),
}));
