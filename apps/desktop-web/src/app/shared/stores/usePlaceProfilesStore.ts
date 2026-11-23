import { create } from 'zustand';

import type { PlaceProfileEntry } from './useSiteProfilesStore';

const sameProfiles = (
    a: Record<string, PlaceProfileEntry> | undefined,
    b: Record<string, PlaceProfileEntry>
): boolean => {
    if (!a) return false;
    const keys = Object.keys(b);
    if (keys.length !== Object.keys(a).length) return false;
    return keys.every(uid => a[uid]?.nick === b[uid]?.nick && a[uid]?.thumbnail === b[uid]?.thumbnail);
};

interface PlaceProfilesState {
    bySid: Record<string, Record<string, PlaceProfileEntry>>;
    setPlace: (placeId: string, profiles: Record<string, PlaceProfileEntry>) => void;
    dropPlaces: (keep: ReadonlySet<string>) => void;
}

export const usePlaceProfilesStore = create<PlaceProfilesState>(set => ({
    bySid: {},
    setPlace: (placeId, profiles) =>
        set(state =>
            sameProfiles(state.bySid[placeId], profiles) ? state : { bySid: { ...state.bySid, [placeId]: profiles } }
        ),
    dropPlaces: keep =>
        set(state =>
            Object.keys(state.bySid).every(placeId => keep.has(placeId))
                ? state
                : { bySid: Object.fromEntries(Object.entries(state.bySid).filter(([placeId]) => keep.has(placeId))) }
        ),
}));
