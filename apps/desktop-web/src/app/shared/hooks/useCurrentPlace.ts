import type { DomainPlace } from '@chatic/runtime';

import { runtime } from '@chatic/runtime';

import { usePlaces } from './usePlaces';

interface CurrentPlace {
    place: DomainPlace | undefined;
    placeName: string;
    placeId: string | null;
}

export const useCurrentPlace = (): CurrentPlace => {
    const { places } = usePlaces();
    const { selectedSiteId } = runtime.session.useSessionSelection();
    const place = places.find(p => p.id === selectedSiteId);
    const placeName = place?.name?.trim() || place?.id || '';
    return { place, placeName, placeId: selectedSiteId };
};
