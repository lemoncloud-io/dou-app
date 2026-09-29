import type { DomainChannel } from '@chatic/data';

import { listingPlaces } from './cloudDmPlaces';

/**
 * A cloud's channels grouped by the places that list them: a group under its own place, a cloud 1:1
 * under each place `dmPlaces` gives it (none while my places are unknown). The quick switcher's
 * index is filed this way, so it offers a 1:1 only where the sidebar lists it.
 */
export const channelsByPlace = (
    channels: readonly DomainChannel[],
    dmPlaces: ReadonlyMap<string, readonly string[]>
): Map<string, DomainChannel[]> => {
    const byPlace = new Map<string, DomainChannel[]>();
    for (const channel of channels) {
        for (const placeId of listingPlaces(channel, dmPlaces)) {
            const list = byPlace.get(placeId);
            if (list) list.push(channel);
            else byPlace.set(placeId, [channel]);
        }
    }
    return byPlace;
};
