import type { DomainPlace } from '@chatic/runtime';
import { applyChannelOrder } from '@chatic/shared';

import type { RailCloud } from '../../../shared';

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
