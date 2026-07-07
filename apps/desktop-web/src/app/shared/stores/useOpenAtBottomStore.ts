import { create } from 'zustand';

interface OpenAtBottomState {
    /** The channel that should open pinned to its latest message (from a notification click). */
    channelId: string | null;
    /** Request that this channel, once opened, lands at the bottom instead of the unread divider. */
    request: (channelId: string) => void;
    clear: () => void;
}

/**
 * One-shot "open this channel at the bottom" flag. A notification click opens the
 * message the user was pinged about — which is the newest one — so the feed should
 * land at the bottom, not on the unread divider (its default first-fill target when
 * the channel has a backlog). ChatPane reads it for the channel being opened and
 * MessageList honours it once; it clears after consumption so a later plain open of
 * the same channel keeps the divider behaviour.
 */
export const useOpenAtBottomStore = create<OpenAtBottomState>(set => ({
    channelId: null,
    request: channelId => set({ channelId }),
    clear: () => set({ channelId: null }),
}));
