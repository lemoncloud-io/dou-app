import type { DomainPlace } from '@chatic/data';
import { applyChannelOrder } from '@chatic/shared';

import type { RailCloud } from '../../../shared';

/**
 * The order the rail draws its clouds in: Home first whatever was stored, then the stored order,
 * then anything the stored order does not name yet. Home is the way back from every cloud, so it
 * never moves.
 *
 * Both the switcher's menu and the number keys read this, because a digit has to name the row the
 * reader is looking at — including after a cloud was dragged somewhere else.
 */
export const orderedRailClouds = (
    clouds: readonly RailCloud[],
    storedIds: readonly string[] | undefined
): RailCloud[] => {
    const home = clouds.find(cloud => cloud.kind === 'home');
    const movable = clouds.filter(cloud => cloud.kind !== 'home');
    const cloudById = new Map(movable.map(cloud => [cloud.id, cloud]));
    return [
        ...(home ? [home] : []),
        ...applyChannelOrder(
            movable.map(cloud => cloud.id),
            storedIds
        ).flatMap(id => cloudById.get(id) ?? []),
    ];
};

/** The order the place tiles are drawn in: the device's stored order, new places after it. */
export const orderedRailPlaces = (
    places: readonly DomainPlace[],
    storedIds: readonly string[] | undefined
): DomainPlace[] => {
    const placeById = new Map(places.map(place => [place.id, place]));
    return applyChannelOrder(
        places.map(place => place.id),
        storedIds
    ).flatMap(id => placeById.get(id) ?? []);
};
