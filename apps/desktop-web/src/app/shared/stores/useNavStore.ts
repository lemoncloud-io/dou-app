import { create } from 'zustand';

export type NavDestination = 'home' | 'notifications' | 'channels' | 'dm';

interface NavState {
    active: NavDestination;
    go: (destination: NavDestination) => void;
}

export const useNavStore = create<NavState>(set => ({
    active: 'home',
    go: destination => set({ active: destination }),
}));
