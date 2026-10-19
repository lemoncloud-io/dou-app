import { dmPlaceOf, isCloudDm, type DomainChannel } from '@chatic/data';

import { isSelfChannel } from './dmDisplay';

/**
 * The places that list each room whose listing is not simply its own `sid`, keyed by channel id.
 *
 * A cloud 1:1 belongs to the place it was opened in: the server opens a separate room per place and
 * never moves one. Its row usually names that place, and a room whose answer carried no field names
 * it in its id (`dmPlaceOf`). It is filed here so a request that names another place — a
 * notification's sender's place, a saved item's — still opens it where it lives. A room that names
 * no place is not filed; it is listed only where a cloud has no place at all (`useChannels`).
 *
 * My notes-to-self room is filed under every place: it belongs to the account, and the server
 * returns it for any place, so filing it by the place its row names would hide it everywhere else —
 * and would leave the unread counts and the quick switcher disagreeing with the sidebar, which lists
 * it everywhere. It is left unfiled while my places are unknown, and keeps its own place until then.
 *
 * Order follows `placeIds`.
 */
export const roomPlaces = (
    channels: readonly DomainChannel[],
    { placeIds }: { placeIds: readonly string[] }
): Map<string, string[]> => {
    const listing = new Map<string, string[]>();
    for (const channel of channels) {
        if (!channel.id) continue;
        if (isSelfChannel(channel)) {
            if (placeIds.length > 0) listing.set(channel.id, [...placeIds]);
            continue;
        }
        if (!isCloudDm(channel)) continue;
        const placeId = dmPlaceOf(channel);
        if (placeId) listing.set(channel.id, [placeId]);
    }
    return listing;
};

/**
 * The places whose list holds a channel: my notes-to-self room the places it was filed under (its
 * own place before my places load), anything else its own place. A cloud 1:1 is no exception — it
 * is listed in its own place only.
 */
export const listingPlaces = (
    channel: DomainChannel,
    filedPlaces: ReadonlyMap<string, readonly string[]>
): readonly string[] => {
    const filed = filedPlaces.get(channel.id ?? '');
    if (isSelfChannel(channel) && filed) return filed;
    return channel.sid ? [channel.sid] : [];
};
