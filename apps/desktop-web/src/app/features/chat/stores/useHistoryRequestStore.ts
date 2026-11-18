import { create } from 'zustand';

export type HistoryDirection = 'back' | 'forward';

interface HistoryRequestState {
    /** Counts every press in the session; 0 means there has been none. */
    nonce: number;
    /** Which way the latest press went. */
    direction: HistoryDirection;
    press: (direction: HistoryDirection) => void;
}

/**
 * One Back or Forward press, from whichever door it came through: Mod+[ and Mod+], the mouse's
 * side buttons, a trackpad swipe or the menu bar. A counter rather than a flag, so a second press
 * fires too.
 *
 * Two listeners answer it, and the route decides which: the router steps through pages on any
 * page other than home, and HomePage steps through the channels the reader moved between on home.
 * Each listener only counts presses made after it mounted, so arriving home through one press does
 * not also spend it on a channel step.
 */
export const useHistoryRequestStore = create<HistoryRequestState>(set => ({
    nonce: 0,
    direction: 'back',
    press: direction => set(s => ({ nonce: s.nonce + 1, direction })),
}));
