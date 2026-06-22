import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SelectedPlaceState {
    selectedPlaceId: string | null;
    selectPlace: (placeId: string) => void;
    clearPlace: () => void;
}

/**
 * Global client state: which place (workspace/site) is active in the far-left
 * rail. Drives the channel list. Lives in Zustand because the rail writes it
 * and the channel column + home page read it.
 *
 * Persisted so a refresh restores the last-selected place instead of snapping
 * back to the first one. localStorage hydration is synchronous, so the value is
 * present before HomePage's auto-select effect runs; an out-of-cloud stale id
 * still self-heals there (the `!inList` fallback). Account-scoped — cleared on
 * logout via useAccountResetOnLogout.
 */
export const useSelectedPlaceStore = create<SelectedPlaceState>()(
    persist(
        set => ({
            selectedPlaceId: null,
            selectPlace: placeId => set({ selectedPlaceId: placeId }),
            clearPlace: () => set({ selectedPlaceId: null }),
        }),
        { name: 'chatic-selected-place' }
    )
);
