import { useCallback } from 'react';

import { runtime } from '@chatic/runtime-react';
import { CLOUD_PROMO_DISMISS_TTL_MS } from '../../../stores/preferenceKeys';

export interface CloudPromoOptions {
    hasOwnedCloud: boolean;
}

export interface CloudPromoResult {
    isVisible: boolean;
    dismiss: () => void;
}

export const useCloudPromo = ({ hasOwnedCloud }: CloudPromoOptions): CloudPromoResult => {
    const dismissedAt = runtime.settings.useConfigValue<number>('ui.cloudPromoDismissedAt') ?? 0;

    const isDismissed = dismissedAt > 0 && Date.now() - dismissedAt < CLOUD_PROMO_DISMISS_TTL_MS;

    const dismiss = useCallback(() => {
        runtime.settings.set('ui.cloudPromoDismissedAt', Date.now(), { lane: 'local' });
    }, []);

    return { isVisible: !hasOwnedCloud && !isDismissed, dismiss };
};
