import type { DomainPlace } from '@chatic/data';

/**
 * The place to move the session into when the one it has selected is not in the list: it was
 * deleted, or the list is another cloud's. `undefined` when the selection is still there, and when
 * there is no place to move to.
 *
 * The place last open in this cloud wins while it still exists, and the first place stands in when
 * it does not. `remembered` is checked against the list because it outlives the place it names: a
 * deleted place stays remembered until another one is opened.
 */
export const placeToEnter = (
    places: readonly Pick<DomainPlace, 'id'>[],
    selectedPlaceId: string | null | undefined,
    remembered: string | undefined
): string | undefined => {
    if (selectedPlaceId && places.some(place => place.id === selectedPlaceId)) return undefined;
    if (remembered && places.some(place => place.id === remembered)) return remembered;
    return places[0]?.id;
};
