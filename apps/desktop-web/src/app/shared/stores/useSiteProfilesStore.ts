import { create } from 'zustand';

export interface PlaceProfileEntry {
    nick?: string;
    thumbnail?: string;
}

export const toProfileMap = (
    list: ReadonlyArray<{ uid?: string; nick?: string; thumbnail?: string }> | undefined
): Record<string, PlaceProfileEntry> => {
    const map: Record<string, PlaceProfileEntry> = {};
    for (const item of list ?? []) {
        if (item.uid) map[item.uid] = { nick: item.nick, thumbnail: item.thumbnail };
    }
    return map;
};

interface SiteProfilesState {
    profiles: Record<string, PlaceProfileEntry>;
    setAll: (profiles: Record<string, PlaceProfileEntry>) => void;
    reset: () => void;
}

export const useSiteProfilesStore = create<SiteProfilesState>(set => ({
    profiles: {},
    setAll: profiles => set({ profiles }),
    reset: () => set({ profiles: {} }),
}));
