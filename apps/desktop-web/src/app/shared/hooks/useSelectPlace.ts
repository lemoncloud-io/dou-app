import { useCallback } from 'react';

import { useSiteSwitch } from '@chatic/app-runtime';
import { useSessionSelection } from '@chatic/web-core';

/**
 * Switch the active place. The place IS the session's selected site, so this just forwards to
 * the engine's `switchSite`, which optimistically pre-applies the sid (cached channels swap
 * instantly), moves the live socket session with SDK `auth.switch`, and rolls the sid back on
 * failure — no app-side loader or manual rollback. Mirrors apps/web `useSwitchPlace`.
 * `isSwitching` is exposed so the rail can disable the place tiles during a switch.
 *
 * The socket half is the whole point, and the import is load-bearing: `@chatic/web-core` exports
 * a hook of the same name that re-issues only the HTTP token. Channels come over the socket, so
 * under that one the server kept answering for the previous place and the sidebar read empty
 * (.claude/20260804/DEBUG-14-20-13.md).
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
