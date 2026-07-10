import { useCallback, useEffect } from 'react';

import { useSessionSelection } from '@chatic/web-core';
import type { DomainPlace } from '@chatic/data';

import { useSiteSwitch } from '../../../runtime/useSiteSwitch';

export interface SwitchPlaceResult {
    selectedPlaceId: string | null;
    switchPlace: (placeId: string) => void;
    isSwitching: boolean;
}

/**
 * Place switching on the runtime session. switchSite() owns the optimistic sid pre-apply,
 * commit, and rollback-on-failure (see testbed ChatHomePage handleSiteClick), so this hook
 * only forwards the click and auto-selects the first place when none is active yet.
 */
export const useSwitchPlace = (places: DomainPlace[]): SwitchPlaceResult => {
    const { selectedSiteId } = useSessionSelection();
    const { switchSite, isSwitching } = useSiteSwitch();

    const switchPlace = useCallback(
        (placeId: string) => {
            if (isSwitching || placeId === selectedSiteId) return;
            void switchSite(placeId);
        },
        [switchSite, selectedSiteId, isSwitching]
    );

    // Auto-select the first place when none is active (e.g. right after a cloud switch).
    useEffect(() => {
        if (selectedSiteId || isSwitching || places.length === 0) return;
        void switchSite(places[0].id);
    }, [selectedSiteId, isSwitching, places, switchSite]);

    return { selectedPlaceId: selectedSiteId, switchPlace, isSwitching };
};
