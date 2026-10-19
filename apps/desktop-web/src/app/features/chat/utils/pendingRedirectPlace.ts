import { openPlaceFor } from './openPlaceFor';

/**
 * Where a pending open should move once this place's list has loaded without the room, or null to
 * stay and keep waiting.
 *
 * Two opens are held until a list has loaded: a cross-cloud open, which lands in the place the
 * request named (for a 1:1 notification, the place its sender was in, which need not be the room's),
 * and an open that arrives while HomePage is still loading, which has not moved at all. Either way,
 * when the landed place does not list the room it moves to the place `openPlaceFor` picks — a 1:1's
 * own place, else `namedPlaceId`. It moves once per room (`redirectedId`), so a list that never gains
 * the room cannot bounce between places. A room whose place is unknown and that was named nowhere
 * stays, as the pending landing already waits for it. A `placeBound` room (the Self Channel) is
 * listed in every place, so being listed here does not settle it: it moves to the place the request
 * named.
 */
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
    // No place selected yet (right after a cloud switch): the place is settled first, or the one
    // move would be spent before the list it is judged by exists.
    if (!pendingId || !here.placeId || here.redirectedId === pendingId) return null;
    if (here.listedIds.has(pendingId) && !here.placeBound) return null;
    const placeId = openPlaceFor(
        { placeId: here.namedPlaceId ?? '', channelId: pendingId, placeBound: here.placeBound },
        here
    );
    return placeId && placeId !== here.placeId ? placeId : null;
};
