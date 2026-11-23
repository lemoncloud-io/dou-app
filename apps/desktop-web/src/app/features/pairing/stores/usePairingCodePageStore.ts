import { create } from 'zustand';

interface PairingCodePageState {
    held: boolean;
    registeredGuest: boolean;
    leaving: boolean;
    hold: (registeredGuest: boolean) => void;
    startLeaving: () => void;
    release: () => void;
}

const initial = { held: false, registeredGuest: false, leaving: false };

export const usePairingCodePageStore = create<PairingCodePageState>(set => ({
    ...initial,
    hold: registeredGuest => set(state => ({ held: true, registeredGuest: state.registeredGuest || registeredGuest })),
    startLeaving: () => set({ leaving: true }),
    release: () => set(initial),
}));
