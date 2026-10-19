import type { DomainChannel } from '@chatic/data';

import { listingPlaces } from './roomPlaces';

/**
 * A cloud's channels grouped by the places that list them: a group channel and a cloud 1:1 under
 * their own place, my notes-to-self room under each place `filedPlaces` gives it. The quick
 * switcher's index is filed this way, so it offers a room only where the sidebar lists it.
 */
export const channelsByPlace = (
    channels: readonly DomainChannel[],
    filedPlaces: ReadonlyMap<string, readonly string[]>
): Map<string, DomainChannel[]> => {
    const byPlace = new Map<string, DomainChannel[]>();
    for (const channel of channels) {
        for (const placeId of listingPlaces(channel, filedPlaces)) {
            const list = byPlace.get(placeId);
            if (list) list.push(channel);
            else byPlace.set(placeId, [channel]);
        }
    }
    return byPlace;
};
