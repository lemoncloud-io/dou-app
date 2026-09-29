import { isCloudWideChannel, type DomainChannel } from '@chatic/data';

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
        const places = isCloudWideChannel(channel) ? (dmPlaces.get(channel.id ?? '') ?? []) : [channel.sid];
        for (const placeId of places) {
            if (placeId) byPlace.set(placeId, [...(byPlace.get(placeId) ?? []), channel]);
        }
    }
    return byPlace;
};
