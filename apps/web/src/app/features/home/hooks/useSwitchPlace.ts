import { useIsMutating } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';

import { runtime, type DomainPlace } from '@chatic/runtime';
import { logger } from '@chatic/bridges';

import { useSiteSwitch } from '../../../runtime/useSiteSwitch';

export interface SwitchPlaceResult {
    selectedPlaceId: string | null;
    switchPlace: (placeId: string) => void;
    isSwitching: boolean;
}

export const useSwitchPlace = (places: DomainPlace[], isPlacesLoading: boolean): SwitchPlaceResult => {
    const { selectedSiteId, selectedCloudId } = runtime.session.useSessionSelection();
    const { switchSite, isSwitching } = useSiteSwitch();
    const isAnySwitchInFlight =
        useIsMutating({ mutationKey: runtime.session.SWITCH_SITE_MUTATION_KEY }) +
            useIsMutating({ mutationKey: runtime.session.SWITCH_CLOUD_MUTATION_KEY }) >
        0;

    const switchPlace = useCallback(
        (placeId: string) => {
            if (isSwitching || placeId === selectedSiteId) return;
            void switchSite(placeId);
        },
        [switchSite, selectedSiteId, isSwitching]
    );

    useEffect(() => {
        if (selectedSiteId || isSwitching || places.length === 0) return;
        void switchSite(places[0].id);
    }, [selectedSiteId, isSwitching, places, switchSite]);

    const isSelectedInList = !!selectedSiteId && places.some(place => place.id === selectedSiteId);
    const seenSelectedIdRef = useRef<string | null>(null);
    const fallbackFromRef = useRef<string | null>(null);
    useEffect(() => {
        if (isSelectedInList) seenSelectedIdRef.current = selectedSiteId;
    }, [isSelectedInList, selectedSiteId]);
    useEffect(() => {
        if (!selectedSiteId || isSelectedInList || isPlacesLoading) return;
        if (selectedCloudId === 'default') return;
        if (seenSelectedIdRef.current !== selectedSiteId) return;
        if (isSwitching || isAnySwitchInFlight) return;
        if (fallbackFromRef.current === selectedSiteId) return;
        fallbackFromRef.current = selectedSiteId;
        if (places.length === 0) {
            runtime.session.clearSiteSelection();
            return;
        }
        switchSite(places[0].id).catch(error => {
            logger.warn('PLACE', '[useSwitchPlace] fallback from a pruned place failed', {
                error,
                data: { from: selectedSiteId, to: places[0].id },
            });
        });
    }, [
        selectedSiteId,
        selectedCloudId,
        isSelectedInList,
        isPlacesLoading,
        places,
        isSwitching,
        isAnySwitchInFlight,
        switchSite,
    ]);

    return { selectedPlaceId: selectedSiteId, switchPlace, isSwitching };
};
