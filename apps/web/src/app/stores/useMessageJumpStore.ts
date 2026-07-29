import { create } from 'zustand';

/**
 * A request to scroll the open channel's feed to a specific message and flash it (search
 * result jump). Transient — never persisted. Ported from desktop-web's useMessageJumpStore;
 * the nonce lets a repeat jump to the same message re-fire.
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

// Tracked outside the store (not derived from the current target's nonce) so a repeat jump
// to the same message still gets a fresh nonce even after `clear()` nulled the target in
// between — deriving from `target?.nonce` would reset to the same value every time.
let nonceCounter = 0;

/** Pending "scroll to this message" target for the open channel feed. */
export const useMessageJumpStore = create<MessageJumpState>(set => ({
    target: null,
    request: (channelId, chatNo) => {
        nonceCounter += 1;
        set({ target: { channelId, chatNo, nonce: nonceCounter } });
    },
    clear: () => set({ target: null }),
}));
