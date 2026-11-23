import type { PlaceProfileEntry } from '../stores/useSiteProfilesStore';

export interface ResolvedDisplay {
    name: string;
    thumbnail: string | undefined;
}

export const resolveDisplay = (
    place: PlaceProfileEntry | undefined,
    fallbackName: string,
    fallbackThumbnail: string | undefined
): ResolvedDisplay => ({
    name: place?.nick?.trim() || fallbackName,
    thumbnail: place?.thumbnail || fallbackThumbnail,
});
