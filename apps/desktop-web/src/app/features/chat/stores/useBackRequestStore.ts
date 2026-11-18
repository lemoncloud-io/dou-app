import { create } from 'zustand';

interface BackRequestState {
    /** Counts every Back press in the session; 0 means there has been none. */
    nonce: number;
    press: () => void;
}

/**
 * One Back press, from whichever door it came through: Mod+[, the mouse's back button, a
 * trackpad swipe or the menu bar. A counter rather than a flag, so a second press fires too.
 *
 * Two listeners answer it, and the route decides which: the router steps back a page from any
 * page other than home, and HomePage takes the jump's way back on home. Each listener only
 * counts presses made after it mounted, so arriving home through one press does not also
 * spend it on the jump return.
 */
export const useBackRequestStore = create<BackRequestState>(set => ({
    nonce: 0,
    press: () => set(s => ({ nonce: s.nonce + 1 })),
}));
