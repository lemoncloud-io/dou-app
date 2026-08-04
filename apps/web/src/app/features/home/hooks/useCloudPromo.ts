import { useCallback } from 'react';

import { usePreferenceStore } from '../../../stores/usePreferenceStore';
import { CLOUD_PROMO_DISMISS_TTL_MS } from '../../../stores/preferenceKeys';

export interface CloudPromoOptions {
    /**
     * Whether the account owns at least one cloud. **Invited clouds do not count** — the pitch is
     * "make a cloud of your own", so being a guest in someone else's does not satisfy it.
     */
    hasOwnedCloud: boolean;
}

export interface CloudPromoResult {
    /** Whether the cloud-promo banner should be rendered right now. */
    isVisible: boolean;
    /** Hide the banner for the next CLOUD_PROMO_DISMISS_TTL_MS, in home AND the switcher sheet. */
    dismiss: () => void;
}

/**
 * Visibility of the "add a cloud" promo banner, shared by the relay home and the cloud-switcher
 * sheet so the two placements can never disagree (ADR-0034).
 *
 * Two gates, in order:
 *  1. Owning at least one cloud hides it permanently — the pitch is already accepted.
 *  2. Dismissing hides it for 24h. The timestamp lives in one preference key, which is why
 *     dismissing in the sheet also hides it on home.
 *
 * `hasOwnedCloud` is a PARAMETER rather than something this hook fetches, and that is load-bearing:
 * `useClouds` is configured `refetchOnMount: 'always'`, so a component that both subscribes to the
 * cloud catalog AND is mounted conditionally on that query's fetching state feeds itself. Mounting
 * triggers a refetch, the refetch flips the host's loading branch, the component unmounts, the fetch
 * settles, it mounts again — an endless shimmer. Keeping the query subscription in the always-mounted
 * host breaks that cycle.
 *
 * The 24h window is measured against the device clock and is therefore trivially bypassable; that
 * is an accepted trade-off for a promo banner. It is also only re-evaluated on render, so a session
 * left mounted across the expiry re-shows the banner on the next re-render rather than on a timer —
 * also fine for a promo.
 */
export const useCloudPromo = ({ hasOwnedCloud }: CloudPromoOptions): CloudPromoResult => {
    const dismissedAt = usePreferenceStore(state => state.cloudPromoDismissedAt);
    const dismissCloudPromo = usePreferenceStore(state => state.dismissCloudPromo);

    // dismissedAt is already sanitized by the store (0 = never, future values degraded to 0).
    const isDismissed = dismissedAt > 0 && Date.now() - dismissedAt < CLOUD_PROMO_DISMISS_TTL_MS;

    const dismiss = useCallback(() => dismissCloudPromo(), [dismissCloudPromo]);

    return { isVisible: !hasOwnedCloud && !isDismissed, dismiss };
};
