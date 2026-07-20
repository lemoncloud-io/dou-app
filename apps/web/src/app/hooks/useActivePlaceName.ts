import { useEffect, useState } from 'react';

import { useRuntimeRepositories } from '@chatic/app-runtime';
import { useSessionSelection } from '@chatic/web-core';

/**
 * Name of the ACTIVE place (site), observed from PlaceRepositoryV2 by the
 * selected site id. Used to label per-place UIs (e.g. the profile edit dialog
 * title) outside the home rail without pulling in home-feature hooks. Returns
 * an empty string when no site is active or its row isn't cached yet.
 */
export const useActivePlaceName = (): string => {
    const { place: placeRepository } = useRuntimeRepositories();
    const { selectedSiteId: sid } = useSessionSelection();

    const [name, setName] = useState('');

    useEffect(() => {
        if (!sid) {
            setName('');
            return;
        }
        return placeRepository.observeItem(sid, place => setName(place?.name ?? ''));
    }, [placeRepository, sid]);

    return name;
};
