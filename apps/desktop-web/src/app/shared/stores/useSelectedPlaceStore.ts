import { create } from 'zustand';

interface SelectedPlaceState {
    selectedPlaceId: string | null;
    selectPlace: (placeId: string) => void;
    clearPlace: () => void;
}

/**
 * Global client state: which place (workspace/site) is active in the far-left
 * rail. Drives the channel list. Lives in Zustand because the rail writes it
 * and the channel column + home page read it.
 */
export const useSelectedPlaceStore = create<SelectedPlaceState>(set => ({
    selectedPlaceId: null,
    selectPlace: placeId => set({ selectedPlaceId: placeId }),
    clearPlace: () => set({ selectedPlaceId: null }),
}));
