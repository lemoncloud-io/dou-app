import type { DomainPlace } from '@chatic/runtime';

export const placeToEnter = (
    places: readonly Pick<DomainPlace, 'id'>[],
    selectedPlaceId: string | null | undefined,
    remembered: string | undefined
): string | undefined => {
    if (selectedPlaceId && places.some(place => place.id === selectedPlaceId)) return undefined;
    if (remembered && places.some(place => place.id === remembered)) return remembered;
    return places[0]?.id;
};
