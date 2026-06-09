import { create } from 'zustand';

interface UnreadState {
    /** Unread message count per place id (`sid`), for the active cloud. */
    byPlace: Record<string, number>;
    setByPlace: (byPlace: Record<string, number>) => void;
}

/**
 * App-level unread snapshot. usePlaceUnreadCounts runs once in the always-mounted
 * shell (ShellUnreadSync) and writes here; HomePage (rail/place switcher) and the
 * OS badge/title both read from this single source — so the badge keeps updating
 * even when HomePage is unmounted (on /profile, /settings).
 */
export const useUnreadStore = create<UnreadState>(set => ({
    byPlace: {},
    setByPlace: byPlace => set({ byPlace }),
}));
