import { placeOfDmId } from '@chatic/data';

/**
 * The place to open a channel in, given the place an open request named (a notification's `sid`, a
 * saved item's place, or none).
 *
 * A cloud 1:1 opens in its own place, whatever the request named: the server opens a separate room
 * per place and never moves one, while a notification names the place its sender was in. Its place
 * is the cached row's (`filedPlaces`), else the place a place-keyed id names — a room not cached yet,
 * such as one just started. A room that names neither keeps the named place.
 *
 * A `placeBound` room (my Self Channel) is listed in every place but holds a separate set of messages
 * in each — the server answers a read from the place the session is in — so the named place wins
 * when it lists the room, and this place is kept only when none was named.
 *
 * A group channel is not filed and keeps the named place.
 */
export const openPlaceFor = (
    target: { placeId: string; channelId: string; placeBound?: boolean },
    here: { placeId: string | null | undefined; filedPlaces: ReadonlyMap<string, readonly string[]> }
): string => {
    const listing = here.filedPlaces.get(target.channelId);
    if (!target.placeBound) return listing?.[0] || placeOfDmId(target.channelId) || target.placeId;
    if (!listing?.length) return target.placeId;
    if (target.placeId && listing.includes(target.placeId)) return target.placeId;
    if (here.placeId && listing.includes(here.placeId)) return here.placeId;
    return listing[0];
};
