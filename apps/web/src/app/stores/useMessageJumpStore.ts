import { create } from 'zustand';

/**
 * A request to scroll the open channel's feed, or one of its thread pages, to a specific message
 * and flash it (search result jump). Transient — never persisted. Ported from desktop-web's useMessageJumpStore;
 * the nonce lets a repeat jump to the same message re-fire.
 */
export interface MessageJumpTarget {
    channelId: string;
    chatNo: number;
    /**
     * Set when the target is a thread reply: the root's chatNo string, naming the thread page that
     * renders it. The room never renders a reply, so it leaves such a target alone, and a thread
     * page handles only the targets naming its own root.
     */
    threadRootNo?: string;
    /** Bumped on each request so a repeat jump to the same message still fires. */
    nonce: number;
}

interface MessageJumpState {
    target: MessageJumpTarget | null;
    request: (channelId: string, chatNo: number, options?: { threadRootNo?: string }) => void;
    clear: () => void;
}

// Tracked outside the store (not derived from the current target's nonce) so a repeat jump
// to the same message still gets a fresh nonce even after `clear()` nulled the target in
// between — deriving from `target?.nonce` would reset to the same value every time.
let nonceCounter = 0;

/** Pending "scroll to this message" target for the open channel feed or one of its threads. */
export const useMessageJumpStore = create<MessageJumpState>(set => ({
    target: null,
    request: (channelId, chatNo, options) => {
        nonceCounter += 1;
        set({ target: { channelId, chatNo, threadRootNo: options?.threadRootNo, nonce: nonceCounter } });
    },
    clear: () => set({ target: null }),
}));

/**
 * Whether `target` is aimed at this surface — the channel's room when `threadRootNo` is omitted,
 * otherwise that one thread. The jump and the room's auto-scroll hold both ask through this, so they
 * cannot disagree on whose target it is.
 */
export const isJumpTargetFor = (
    target: MessageJumpTarget | null,
    channelId: string,
    threadRootNo?: string
): target is MessageJumpTarget => !!target && target.channelId === channelId && target.threadRootNo === threadRootNo;
