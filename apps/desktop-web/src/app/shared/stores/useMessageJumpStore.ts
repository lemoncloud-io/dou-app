import { create } from 'zustand';

/**
 * A request to scroll the open channel's feed to a specific message and flash
 * it (saved-item / search / mention jump). Transient — never persisted. Mirrors
 * usePendingOpenStore: the nonce lets a repeat jump to the same message re-fire.
 */
export interface MessageJumpTarget {
    channelId: string;
    /** Null only on a restore: back to the latest, where the reader was. */
    chatNo: number | null;
    /**
     * Put the reader back where they were: the row goes to the top of the view,
     * as it was, and is not flashed. A jump centres and flashes it: "look at this".
     */
    restore: boolean;
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
 * It holds the whole position, not the channel alone. Returning to the channel
 * used to land at the bottom with the thread shut, which is not where anyone
 * was; the cloud and place are there because a jump can cross both.
 */
export interface MessageJumpOrigin {
    /** The active cloud id, `'default'` on the Default Cloud. */
    cloudId: string;
    placeId: string | null;
    channelId: string;
    /** Display label captured at record time: the origin may be in a list no longer loaded. */
    label: string;
    /** The message the reader was reading; null when they were at the latest. */
    anchorChatNo: number | null;
    /** The thread open beside the feed, reopened on return. */
    threadRootId: string | null;
    /** The jump stayed in the channel, so being in the channel is not being back. */
    sameChannel: boolean;
}

/** Where the reader is in the open channel's feed, kept current by the feed as it scrolls. */
export interface ReadingPosition {
    channelId: string;
    /** First message in view; null when the feed is at the latest. */
    chatNo: number | null;
}

interface MessageJumpState {
    target: MessageJumpTarget | null;
    origin: MessageJumpOrigin | null;
    position: ReadingPosition | null;
    /** Jump without recording a return point (the reader was nowhere to return to). */
    request: (channelId: string, chatNo: number | null, options?: { restore?: boolean }) => void;
    /**
     * Record where the reader is standing, for the return affordance. Called by
     * the jump entry points before they move anyone. One level deep: a second
     * jump replaces the first return point, as a browser's single Back would if
     * it had no history.
     */
    setOrigin: (origin: MessageJumpOrigin | null) => void;
    clearOrigin: () => void;
    setPosition: (position: ReadingPosition) => void;
    clear: () => void;
}

/**
 * Nonces count every request for the session. They used to count from the
 * current target, which `clear` empties once a jump lands, so the next jump
 * reused the nonce the feed had just finished with and was ignored as handled.
 */
let requestCount = 0;

/** Pending "scroll to this message" target for the open channel feed. */
export const useMessageJumpStore = create<MessageJumpState>((set, get) => ({
    target: null,
    origin: null,
    position: null,
    request: (channelId, chatNo, options) => {
        requestCount += 1;
        set({ target: { channelId, chatNo, restore: options?.restore ?? false, nonce: requestCount } });
    },
    setOrigin: origin => set({ origin }),
    clearOrigin: () => set({ origin: null }),
    setPosition: position => {
        const current = get().position;
        // Called on every scroll frame; an unchanged position must not notify.
        if (current?.channelId === position.channelId && current.chatNo === position.chatNo) return;
        set({ position });
    },
    clear: () => set({ target: null }),
}));
