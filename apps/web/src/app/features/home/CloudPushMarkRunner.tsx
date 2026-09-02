import { useCallback, useEffect, useMemo } from 'react';

import { useGlobalCacheSearch, useRuntimeSocketState } from '@chatic/app-runtime';
import { useSessionSelection } from '@chatic/app-runtime';
import { useCloudSessionCatalog } from '../../hooks/useCloudCatalog';
import type { AppMessageData } from '@chatic/app-messages';

import { appBridge } from '../../bridge/appBridge';
import { useOnBackgroundStatusChanged, useOnReceiveNotification } from '../../bridge/useHandleAppMessage';
import { extractPushCloudHint } from '../../utils/resolveInAppPushRoute';
import { useInvitedClouds } from '../../hooks';
import { useCloudPushMarkStore } from './stores/useCloudPushMarkStore';
import { RELAY_CLOUD_ID, resolvePushCloudId } from './utils/resolvePushCloudId';

/**
 * Cross-cloud push → dot mark (ADR-0056 결정 2·3). Mounted once under AppRuntime, alongside
 * `UnreadBadgeRunner`.
 *
 * Two arrival paths feed the same mark store:
 * - **Foreground**: `OnReceiveNotification` resolves the source cloud immediately.
 * - **Background/killed**: never reaches this bridge at all (see docs/mobile/push.md) — the
 *   native shell (iOS NSE / Android FCM service) records the raw hint instead, and this runner
 *   drains that store (`appBridge.fetchPushMarks`, read+clear in one call) on mount — by the time
 *   this runner mounts inside `RuntimeConnectionHost`, the `WebAppReady` handshake has already
 *   completed, so a plain mount-effect IS "after boot" — and again on every foreground return,
 *   since a mark can land while the app was merely backgrounded (not killed).
 *
 * A push naming the ACTIVE cloud is never marked — the live socket already owns that cloud's
 * unread state, so marking it would just be redundant with something the dot is already reading
 * from elsewhere (`useOtherCloudUnread`'s cache hint / the active-place aggregation).
 *
 * Mark clearing is NOT tied to the switch edge. It is a standing effect keyed on
 * `(isVerified && activeBadged)`: a mark that lands for the cloud you are ALREADY looking at
 * (e.g. a push resolved slightly after the socket verified) still gets swept, because the
 * condition re-evaluates on every state change, not just the transition into it. Firing on the
 * edge alone was the confirmed bug in the desktop reference this was ported from.
 */
export const CloudPushMarkRunner = (): null => {
    const { selectedCloudId } = useSessionSelection();
    const { isVerified } = useRuntimeSocketState();
    const { clouds: ownedClouds } = useCloudSessionCatalog();
    const { invitedClouds } = useInvitedClouds();
    const { resolveContext } = useGlobalCacheSearch();

    const mark = useCloudPushMarkStore(s => s.mark);
    const clear = useCloudPushMarkStore(s => s.clear);
    const activeBadged = useCloudPushMarkStore(s => (selectedCloudId ? !!s.badged[selectedCloudId] : false));

    // Every cloud the account might belong to — owned + invited + relay. Deliberately not narrowed
    // to "other than active": resolution doesn't know which cloud is active, `apply` below does.
    const cids = useMemo(() => {
        const ids = new Set<string>([RELAY_CLOUD_ID]);
        for (const cloud of ownedClouds) if (cloud.id) ids.add(cloud.id);
        for (const cloud of invitedClouds) if (cloud.id) ids.add(cloud.id);
        return [...ids];
    }, [ownedClouds, invitedClouds]);
    // Joined so the callback only changes identity on membership changes, not on every render's
    // new array/Set.
    const cidsKey = cids.join(',');

    const handleReceiveNotification = useCallback(
        (message: AppMessageData<'OnReceiveNotification'>) => {
            const data = message.data?.notification?.data;
            if (!data) return;

            const hint = extractPushCloudHint(data);
            void resolvePushCloudId(hint, { cids, resolveContext }).then(cloudId => {
                if (!cloudId || cloudId === selectedCloudId) return;
                mark(cloudId);
            });
        },
        // Keyed on cidsKey, not cids: the array is rebuilt every render (see useOtherCloudUnread).
        [cidsKey, resolveContext, selectedCloudId, mark]
    );

    useOnReceiveNotification(handleReceiveNotification);

    // Drains the native mark store (background/killed arrivals) and resolves+marks each record with
    // the same single-point logic as the foreground path above.
    const drainNativeMarks = useCallback(async () => {
        const records = await appBridge.fetchPushMarks();
        for (const hint of records) {
            const cloudId = await resolvePushCloudId(hint, { cids, resolveContext });
            if (!cloudId || cloudId === selectedCloudId) continue;
            mark(cloudId);
        }
        // Keyed on cidsKey, not cids: the array is rebuilt every render (see useOtherCloudUnread).
    }, [cidsKey, resolveContext, selectedCloudId, mark]);

    useEffect(() => {
        // Boot-only: a native mark backlog is drained once here, not re-read on every
        // cids/selectedCloudId change — the store's own mark/clear already reacts to those.
        void drainNativeMarks();
    }, []);

    useOnBackgroundStatusChanged(message => {
        if (message.data.isForeground) void drainNativeMarks();
    });

    useEffect(() => {
        if (isVerified && selectedCloudId && activeBadged) clear(selectedCloudId);
    }, [isVerified, selectedCloudId, activeBadged, clear]);

    return null;
};
