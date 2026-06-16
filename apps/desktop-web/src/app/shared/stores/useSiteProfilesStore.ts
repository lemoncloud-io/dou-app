import { create } from 'zustand';

/** Display fields a Place Profile can override (keyed by canonical uid). */
export interface PlaceProfileEntry {
    nick?: string;
    thumbnail?: string;
}

interface SiteProfilesState {
    /** uid → active Place Profile for the CURRENT place. Absence = use Global. */
    profiles: Record<string, PlaceProfileEntry>;
    setAll: (profiles: Record<string, PlaceProfileEntry>) => void;
    reset: () => void;
}

/**
 * The active Place Profiles for the current place, mirrored from the engine
 * `profile` cache by a single subscription (useSiteProfiles). Session-scoped —
 * the durable copy is the IndexedDB cache; this store is the render view every
 * display surface reads via useDisplayProfile. Reset on place switch.
 */
export const useSiteProfilesStore = create<SiteProfilesState>(set => ({
    profiles: {},
    setAll: profiles => set({ profiles }),
    reset: () => set({ profiles: {} }),
}));
