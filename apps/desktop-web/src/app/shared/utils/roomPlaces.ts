import { dmPlaceOf, isCloudDm, type DomainChannel } from '@chatic/runtime';

import { isSelfChannel } from './dmDisplay';

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

export const listingPlaces = (
    channel: DomainChannel,
    filedPlaces: ReadonlyMap<string, readonly string[]>
): readonly string[] => {
    const filed = filedPlaces.get(channel.id ?? '');
    if (isSelfChannel(channel) && filed) return filed;
    return channel.sid ? [channel.sid] : [];
};
