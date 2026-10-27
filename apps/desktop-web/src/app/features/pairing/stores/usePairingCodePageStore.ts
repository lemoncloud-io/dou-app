import { create } from 'zustand';

interface PairingCodePageState {
    /**
     * The code screen is in use and has not been left. It signs in as a guest before asking for a code
     * (the relay takes a code request from a guest session only), which flips the router to its
     * signed-in branch mid-flow; while this is set that branch still routes `/auth/pair`, so the page
     * survives the flip instead of being redirected home.
     */
    held: boolean;
    /**
     * The guest session was registered by this screen, not chosen by the person. Backing out signs it
     * out again, or they would land in the app as a guest they never asked for.
     */
    registeredGuest: boolean;
    /**
     * Backing out is signing that guest out. The sign-out drops the session before its reload, which
     * flips the router back to the signed-out branch for a moment — where this page would otherwise
     * start over and register a guest again.
     */
    leaving: boolean;
    hold: (registeredGuest: boolean) => void;
    startLeaving: () => void;
    release: () => void;
}

const initial = { held: false, registeredGuest: false, leaving: false };

/**
 * State of the browser's "sign in with another device" screen, kept outside the component because the
 * auth branch flip remounts the page while the flow is still starting.
 */
export const usePairingCodePageStore = create<PairingCodePageState>(set => ({
    ...initial,
    // A hold taken again (a retry after a failed guest sign-in) keeps what the first one learned: once
    // this screen registered the guest, it stays the one to undo it.
    hold: registeredGuest => set(state => ({ held: true, registeredGuest: state.registeredGuest || registeredGuest })),
    startLeaving: () => set({ leaving: true }),
    release: () => set(initial),
}));
