import { create } from 'zustand';

import { takeSignInNotice, type SignInNoticeRecord } from '../utils/signInNotice';

interface SignInNoticeState {
    /** What is still to be said about the sign-in that brought the app up, until it has been said. */
    notice: SignInNoticeRecord | null;
    /** Take a notice left in storage since the store was made. Keeps the one held when there is none. */
    pick: () => void;
    clear: () => void;
}

/**
 * The post-sign-in notice, taken out of storage when the app loads rather than when the notice
 * component mounts, so the first render of the signed-in app already knows a new account is waiting
 * to be named. The first-run tips read it to stay closed until then: two dialogs at once put the tips
 * over the "not my account" stop.
 */
export const useSignInNoticeStore = create<SignInNoticeState>(set => ({
    notice: takeSignInNotice(),
    pick: () => {
        // The take empties storage, so a second call (React's development double run, a remount)
        // reads nothing; that must not wipe the notice the first one read.
        const taken = takeSignInNotice();
        if (taken) set({ notice: taken });
    },
    clear: () => set({ notice: null }),
}));

/** A new account is waiting on its stop: other first-run dialogs hold back until it is answered. */
export const selectNewAccountPending = (s: SignInNoticeState): boolean => s.notice?.isNew === true;
