import type { DomainSite } from '@chatic/data';

import { useSessionSelection } from '@chatic/web-core';

import { usePlaces } from './usePlaces';

interface CurrentPlace {
    place: DomainSite | undefined;
    /** Display name of the active place, or '' when none is resolvable (default cloud). */
    placeName: string;
    placeId: string | null;
}

/**
 * The active place (site) resolved to a display name. Surfaced wherever a
 * per-place identity is shown or edited (profile card, place-profile dialog) so
 * the user always knows *which* place a profile applies to — the per-place
 * scope is otherwise invisible once you leave the place switcher.
 */
export const useCurrentPlace = (): CurrentPlace => {
    const { places } = usePlaces();
    // The active place IS the session's selected site (null in the Default Cloud → no place).
    const { selectedSiteId } = useSessionSelection();
    const place = places.find(p => p.id === selectedSiteId);
    const placeName = place?.name?.trim() || place?.id || '';
    return { place, placeName, placeId: selectedSiteId };
};
