/**
 * The place to open a channel in, given the place an open request named (a notification's `sid`, a
 * saved item's place, or none).
 *
 * A cloud 1:1 can be listed in several places and its `sid` need not be one of them, so the named
 * place is not trusted for it: stay where I am when this place lists the room, else go to the named
 * place when it lists the room, else to the first place that does. Switching to a place that does not
 * list the room would wait on it until the pending landing expires.
 *
 * Anything `dmPlaces` does not know — a group channel, or a room not synced yet — keeps the named place.
 */
export const openPlaceFor = (
    target: { placeId: string; channelId: string },
    here: { placeId: string | null | undefined; dmPlaces: ReadonlyMap<string, readonly string[]> }
): string => {
    const listing = here.dmPlaces.get(target.channelId);
    if (!listing?.length) return target.placeId;
    if (here.placeId && listing.includes(here.placeId)) return here.placeId;
    if (target.placeId && listing.includes(target.placeId)) return target.placeId;
    return listing[0];
};
