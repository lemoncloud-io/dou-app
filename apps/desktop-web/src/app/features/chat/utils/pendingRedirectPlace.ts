import { openPlaceFor } from './openPlaceFor';

export const pendingRedirectPlace = (
    pendingId: string | null,
    here: {
        placeId: string | null | undefined;
        listedIds: ReadonlySet<string>;
        filedPlaces: ReadonlyMap<string, readonly string[]>;
        redirectedId: string | null;
        namedPlaceId?: string;
        placeBound?: boolean;
    }
): string | null => {
    if (!pendingId || !here.placeId || here.redirectedId === pendingId) return null;
    if (here.listedIds.has(pendingId) && !here.placeBound) return null;
    const placeId = openPlaceFor(
        { placeId: here.namedPlaceId ?? '', channelId: pendingId, placeBound: here.placeBound },
        here
    );
    return placeId && placeId !== here.placeId ? placeId : null;
};
