import { useCallback } from 'react';

import { useSessionSelection, useSiteSwitch } from '@chatic/web-core';

/**
 * Switch the active place. The place IS the session's selected site, so this just forwards to
 * the engine's `switchSite`, which optimistically pre-applies the sid (cached channels swap
 * instantly), commits via the cloud-session refresh in the background, and rolls the sid back
 * on failure — no app-side loader or manual rollback. Mirrors apps/web `useSwitchPlace`.
 * `isSwitching` is exposed so the rail can disable the place tiles during a switch.
 */
export const useSelectPlace = () => {
    const { selectedSiteId } = useSessionSelection();
    const { switchSite, isSwitching } = useSiteSwitch();

    const switchPlace = useCallback(
        (placeId: string) => {
            if (isSwitching || placeId === selectedSiteId) return;
            void switchSite(placeId);
        },
        [switchSite, selectedSiteId, isSwitching]
    );

    return { switchPlace, isSwitching };
};
