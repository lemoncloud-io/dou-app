import type { PlaceProfileEntry } from '../stores/useSiteProfilesStore';

export interface ResolvedDisplay {
    name: string;
    thumbnail: string | undefined;
}

/**
 * Display Profile merge (ADR 0007): an active Place Profile overrides the Global
 * fallback field-by-field. The single merge used by every surface (selector +
 * message rows) — pass the place entry (if any) and the caller's already-resolved
 * global name/thumbnail. Avatar color seed stays keyed to the canonical uid
 * elsewhere.
 */
export const resolveDisplay = (
    place: PlaceProfileEntry | undefined,
    fallbackName: string,
    fallbackThumbnail: string | undefined
): ResolvedDisplay => ({
    name: place?.nick?.trim() || fallbackName,
    thumbnail: place?.thumbnail || fallbackThumbnail,
});
