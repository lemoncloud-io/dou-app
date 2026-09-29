import { openPlaceFor } from './openPlaceFor';

/**
 * Where a pending open should move once this place's list has loaded without the room, or null to
 * stay and keep waiting.
 *
 * Two opens are held until a list has loaded, because only then can a 1:1 be placed: a cross-cloud
 * open, which lands in the place the request named (for a 1:1, only its stamp), and an open that
 * arrives while HomePage is still loading, which has not moved at all. Either way, when the landed
 * place does not list the room it moves to the place `openPlaceFor` picks for `namedPlaceId`. It
 * moves once per room (`redirectedId`), so a list that never gains the room cannot bounce between
 * places. A room nobody has placed yet (just started, not synced) and named nowhere stays, as the
 * pending landing already waits for it.
 */
export const pendingRedirectPlace = (
    pendingId: string | null,
    here: {
        placeId: string | null | undefined;
        listedIds: ReadonlySet<string>;
        dmPlaces: ReadonlyMap<string, readonly string[]>;
        redirectedId: string | null;
        namedPlaceId?: string;
    }
): string | null => {
    // No place selected yet (right after a cloud switch): the place is settled first, or the one
    // move would be spent on the stamp.
    if (!pendingId || !here.placeId || here.listedIds.has(pendingId) || here.redirectedId === pendingId) return null;
    const placeId = openPlaceFor({ placeId: here.namedPlaceId ?? '', channelId: pendingId }, here);
    return placeId && placeId !== here.placeId ? placeId : null;
};
