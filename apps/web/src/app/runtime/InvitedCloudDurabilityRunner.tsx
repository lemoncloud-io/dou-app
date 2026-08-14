import { useCallback } from 'react';

import {
    isNativeApp,
    recoverInvitedCloudIfMissing,
    useInvitedCloudNameSync,
    useRuntimeRepositories,
} from '@chatic/app-runtime';
import type { AppMessageData } from '@chatic/app-messages';

import { useOnReceiveNotification } from '../bridge';
import { extractPushContext } from '../utils/resolveInAppPushRoute';

/**
 * Keeps invited clouds durable — they are the only cache type with no server list API to refill
 * from. Mounted once under AppRuntime.
 *
 * - Push: when a foreground push names a source cloud (`data.cid`) that is not cached, re-derives
 *   and re-caches it so cross-cloud routing can resolve it. Empty cid (common on deployed backends)
 *   is a no-op — that case needs backend support (ADR-0030).
 * - Verified: fetches the active invited cloud's authoritative name (the delegation token has none).
 *
 * The one-time web→native migration this also mounted was retired in ADR-0053; the push path above
 * is now the only repair, and it is reactive, so it fixes a named cloud rather than the list.
 */
export const InvitedCloudDurabilityRunner = (): null => {
    const { cloud } = useRuntimeRepositories();

    useInvitedCloudNameSync();

    const handleReceiveNotification = useCallback(
        (message: AppMessageData<'OnReceiveNotification'>) => {
            // The native store only exists in the native WebView; match the boot hook's guard.
            if (!isNativeApp()) return;
            const data = message.data?.notification?.data;
            if (!data) return;
            // cid usually lives inside the `payload` JSON string, with a top-level fallback —
            // reuse the same extraction as push routing (do not read data.cid directly).
            const { cid } = extractPushContext(data);
            void recoverInvitedCloudIfMissing(cloud, cid);
        },
        [cloud]
    );

    useOnReceiveNotification(handleReceiveNotification);

    return null;
};
