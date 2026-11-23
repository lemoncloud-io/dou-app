import type { DomainChannel } from '@chatic/runtime';

import { listingPlaces } from './roomPlaces';

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
