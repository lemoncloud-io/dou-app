import { useCallback } from 'react';

import { useCloudSessionCatalog } from '@chatic/web-core';

import { usePreferenceStore } from '../../../stores/usePreferenceStore';
import { CLOUD_PROMO_DISMISS_TTL_MS } from '../../../stores/preferenceKeys';

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
 *  1. Owning at least one cloud hides it permanently — the pitch is already accepted. The count
 *     comes from the same relay catalog the switcher lists, so both surfaces see one truth.
 *  2. Dismissing hides it for 24h. The timestamp lives in one preference key, which is why
 *     dismissing in the sheet also hides it on home.
 *
 * The 24h window is measured against the device clock and is therefore trivially bypassable; that
 * is an accepted trade-off for a promo banner. It is also only re-evaluated on render, so a session
 * left mounted across the expiry re-shows the banner on the next re-render rather than on a timer —
 * also fine for a promo.
 */
export const useCloudPromo = (): CloudPromoResult => {
    const { clouds } = useCloudSessionCatalog();
    const dismissedAt = usePreferenceStore(state => state.cloudPromoDismissedAt);
    const dismissCloudPromo = usePreferenceStore(state => state.dismissCloudPromo);

    const ownsCloud = clouds.length > 0;
    // dismissedAt is already sanitized by the store (0 = never, future values degraded to 0).
    const isDismissed = dismissedAt > 0 && Date.now() - dismissedAt < CLOUD_PROMO_DISMISS_TTL_MS;

    const dismiss = useCallback(() => dismissCloudPromo(), [dismissCloudPromo]);

    return { isVisible: !ownsCloud && !isDismissed, dismiss };
};
