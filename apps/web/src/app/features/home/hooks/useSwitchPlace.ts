import { useIsMutating } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';

import { runtime } from '@chatic/app-runtime';
import type { DomainPlace } from '@chatic/data';
import { logger } from '@chatic/bridges';

import { useSiteSwitch } from '../../../runtime/useSiteSwitch';

export interface SwitchPlaceResult {
    selectedPlaceId: string | null;
    switchPlace: (placeId: string) => void;
    isSwitching: boolean;
}

/**
 * Place switching on the runtime session. switchSite() owns the optimistic sid pre-apply,
 * commit, and rollback-on-failure (see testbed ChatHomePage handleSiteClick), so this hook
 * only forwards the click, auto-selects the first place when none is active yet, and leaves a
 * stored selection whose place has been pruned from the list (see below).
 *
 * `isPlacesLoading` is the list's own "still unknown" flag (useHomePlaces). It gates the
 * stale-selection fallback only.
 */
export const useSwitchPlace = (places: DomainPlace[], isPlacesLoading: boolean): SwitchPlaceResult => {
    const { selectedSiteId, selectedCloudId } = runtime.session.useSessionSelection();
    const { switchSite, isSwitching } = useSiteSwitch();
    // `isSwitching` above is this instance's own mutation. A switch driven from elsewhere — a push
    // tap, an invite acceptance, the search screen — is visible only through the global count on
    // the shared keys (the same observer useBackgroundSync uses to pause its tick).
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

    // Auto-select the first place when none is active (e.g. right after a cloud switch).
    useEffect(() => {
        if (selectedSiteId || isSwitching || places.length === 0) return;
        void switchSite(places[0].id);
    }, [selectedSiteId, isSwitching, places, switchSite]);

    // The selection persists across launches (localStorage inside the native shell), so it can
    // outlive its place: one deleted or left while the app was closed keeps its cached row until
    // the next full list refresh prunes it, but nothing prunes the stored id. Left alone it kept
    // the auto-select above off, and home rendered a place nobody is in — no selected row, an
    // empty Chat section — until the user tapped another.
    //
    // "Gone" is observed, not inferred. The fallback fires only once the selected id has been SEEN
    // in the list and then dropped out of it while the selection stayed put — which is what a
    // server snapshot pruning the row looks like from here. Mere absence is not enough: a flow
    // that switches into a place this device has not cached yet (a push tap, an invite
    // acceptance) lands on home with a selection the list will not carry until the refresh brings
    // the row, and reading that as stale would switch the user straight back out.
    const isSelectedInList = !!selectedSiteId && places.some(place => place.id === selectedSiteId);
    const seenSelectedIdRef = useRef<string | null>(null);
    const fallbackFromRef = useRef<string | null>(null);
    useEffect(() => {
        if (isSelectedInList) seenSelectedIdRef.current = selectedSiteId;
    }, [isSelectedInList, selectedSiteId]);
    useEffect(() => {
        if (!selectedSiteId || isSelectedInList || isPlacesLoading || places.length === 0) return;
        // The relay has exactly one place and it is auto-selected; there is nothing to fall
        // back across, and its list is not the place-management surface a cloud's is.
        if (selectedCloudId === 'default') return;
        if (seenSelectedIdRef.current !== selectedSiteId) return;
        if (isSwitching || isAnySwitchInFlight) return;
        // One attempt per stale id: a rejected switch rolls the selection back to it, and the
        // effect would otherwise retry on every settle.
        if (fallbackFromRef.current === selectedSiteId) return;
        fallbackFromRef.current = selectedSiteId;
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
