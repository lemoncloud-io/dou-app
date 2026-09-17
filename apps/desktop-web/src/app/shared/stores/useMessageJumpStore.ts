import { create } from 'zustand';

/**
 * A request to scroll the open channel's feed to a specific message and flash
 * it (saved-item / search / mention jump). Transient — never persisted. Mirrors
 * usePendingOpenStore: the nonce lets a repeat jump to the same message re-fire.
 */
export interface MessageJumpTarget {
    channelId: string;
    chatNo: number;
    /** Bumped on each request so a repeat jump to the same message still fires. */
    nonce: number;
}

/**
 * Where the reader was standing when a jump took them away.
 *
 * Every jump surface — search, saved, mentions, a notification, a rail switch —
 * used to move the reader and forget the previous position, so "go check the
 * evidence, then come back" had no second half: no back affordance, no history,
 * nothing. The origin is what the return affordance in the feed is built on.
 *
 * It holds a place as well as a channel because a jump can cross places, and
 * returning to the channel alone would leave the reader in the wrong workspace.
 */
export interface MessageJumpOrigin {
    placeId: string | null;
    channelId: string;
}

interface MessageJumpState {
    target: MessageJumpTarget | null;
    origin: MessageJumpOrigin | null;
    /** Jump without recording a return point (the reader was nowhere to return to). */
    request: (channelId: string, chatNo: number) => void;
    /**
     * Record where the reader is standing, for the return affordance. Called by
     * the jump entry points before they move anyone. A jump that lands in the
     * channel the reader is already in records nothing: there is nothing to
     * return to, and a pill offering to take them where they are is noise.
     */
    setOrigin: (origin: MessageJumpOrigin | null) => void;
    clearOrigin: () => void;
    clear: () => void;
}

/** Pending "scroll to this message" target for the open channel feed. */
export const useMessageJumpStore = create<MessageJumpState>((set, get) => ({
    target: null,
    origin: null,
    request: (channelId, chatNo) => set({ target: { channelId, chatNo, nonce: (get().target?.nonce ?? 0) + 1 } }),
    setOrigin: origin => set({ origin }),
    clearOrigin: () => set({ origin: null }),
    clear: () => set({ target: null }),
}));
