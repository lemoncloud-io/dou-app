import { useCallback, useRef } from 'react';

import { runtime } from '@chatic/app-runtime';
import { RELAY_CLOUD_ID } from '@chatic/data';
import type { AppMessageData } from '@chatic/app-messages';

import { useOnReceiveNotification } from '../bridge';
import { extractPushContext, RELAY_ORIGIN_CID } from '../utils/resolveInAppPushRoute';

/**
 * Keeps invited clouds durable — they are the only cache type with no server list API to refill
 * from. Mounted once under AppRuntime.
 *
 * - Push: when a foreground push names a source cloud (`data.cid`) that is not cached, re-derives
 *   and re-caches it so cross-cloud routing can resolve it. Empty cid (common on deployed backends)
 *   is a no-op — that case needs backend support (ADR-0030).
 *   A relay-origin push is a no-op too: its `'#'` is the relay, which is never an invited cloud and
 *   has no delegation to re-derive.
 * - Verified: fetches the active invited cloud's authoritative name (the delegation token has none).
 *
 * The one-time web→native migration this also mounted was retired in ADR-0053; the push path above
 * is now the only repair, and it is reactive, so it fixes a named cloud rather than the list.
 */
export const InvitedCloudDurabilityRunner = (): null => {
    const { cloud } = runtime.data.useRuntimeRepositories();
    /**
     * Clouds with a recovery in flight. A chatty room bursts pushes for one cloud, and each would
     * otherwise issue its own relay `delegate-cloud` before the first had cached the row.
     */
    const inflightRef = useRef(new Set<string>());

    runtime.data.useInvitedCloudNameSync();

    const handleReceiveNotification = useCallback(
        (message: AppMessageData<'OnReceiveNotification'>) => {
            // The native store only exists in the native WebView; match the boot hook's guard.
            if (!runtime.boot.isNativeApp()) return;
            const data = message.data?.notification?.data;
            if (!data) return;
            // cid usually lives inside the `payload` JSON string, with a top-level fallback —
            // reuse the same extraction as push routing (do not read data.cid directly).
            const { cid } = extractPushContext(data);
            const cloudId = cid === RELAY_ORIGIN_CID ? RELAY_CLOUD_ID : cid;
            if (!cloudId || cloudId === RELAY_CLOUD_ID) return;

            const inflight = inflightRef.current;
            if (inflight.has(cloudId)) return;
            inflight.add(cloudId);
            void runtime.data
                .recoverInvitedCloudIfMissing(cloud, cloudId)
                // Best-effort: the cache read ahead of the relay call can still reject.
                .catch(() => undefined)
                .finally(() => {
                    inflight.delete(cloudId);
                });
        },
        [cloud]
    );

    useOnReceiveNotification(handleReceiveNotification);

    return null;
};
