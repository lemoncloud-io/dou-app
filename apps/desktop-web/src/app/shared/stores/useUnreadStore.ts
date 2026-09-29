import { create } from 'zustand';

interface UnreadState {
    /** Unread message count per place id, for the active cloud. A 1:1 counts in every place listing it. */
    byPlace: Record<string, number>;
    /** The active cloud's unread messages, each channel counted once — not the sum of `byPlace`. */
    total: number;
    setUnread: (unread: { byPlace: Record<string, number>; total: number }) => void;
}

/**
 * App-level unread snapshot. usePlaceUnreadCounts runs once in the always-mounted
 * shell (ShellUnreadSync) and writes here; HomePage (rail/place switcher) and the
 * OS badge/title both read from this single source — so the badge keeps updating
 * even when HomePage is unmounted (on /profile, /settings).
 */
export const useUnreadStore = create<UnreadState>(set => ({
    byPlace: {},
    total: 0,
    setUnread: ({ byPlace, total }) => set({ byPlace, total }),
}));
