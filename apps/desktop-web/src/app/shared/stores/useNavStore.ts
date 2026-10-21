import { create } from 'zustand';

/** The four places the nav rail leads to. Each one decides what the sidebar column shows. */
export type NavDestination = 'home' | 'notifications' | 'channels' | 'dm';

interface NavState {
    active: NavDestination;
    go: (destination: NavDestination) => void;
}

/**
 * Which nav rail destination is open. Session state on purpose: the app opens on Home, where the
 * conversation a reader left is one click away in its section.
 */
export const useNavStore = create<NavState>(set => ({
    active: 'home',
    go: destination => set({ active: destination }),
}));
