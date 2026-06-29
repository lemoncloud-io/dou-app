import { useCallback } from 'react';

import { useSiteSwitch } from '@chatic/web-core';

/**
 * Place (site) auth for desktop. In v2 the per-place token refresh + socket re-auth is owned
 * entirely by the session service behind the `useSiteSwitch` hook (`switchSite`): it pre-applies
 * the target sid optimistically, commits via the cloud/relay token refresh, and rolls the sid back
 * on failure. There is no public imperative entry point, so the old standalone `authPlace` util is
 * replaced by this hook — mirrors apps/web `useSwitchPlace`.
 *
 * Returns an `authPlace(placeId)` callback that resolves once the new place session is committed.
 */
export const useAuthPlace = (): ((placeId: string) => Promise<void>) => {
    const { switchSite } = useSiteSwitch();
    return useCallback((placeId: string) => switchSite(placeId), [switchSite]);
};
