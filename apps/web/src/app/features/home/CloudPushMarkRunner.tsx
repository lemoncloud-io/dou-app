import { useCallback, useEffect, useMemo } from 'react';

import { useGlobalCacheSearch, useRuntimeSocketState } from '@chatic/app-runtime';
import { useCloudSessionCatalog, useSessionSelection } from '@chatic/web-core';
import type { AppMessageData } from '@chatic/app-messages';

import { useOnReceiveNotification } from '../../bridge/useHandleAppMessage';
import { extractPushCloudHint } from '../../utils/resolveInAppPushRoute';
import { useInvitedClouds } from '../../hooks';
import { useCloudPushMarkStore } from './stores/useCloudPushMarkStore';
import { RELAY_CLOUD_ID, resolvePushCloudId } from './utils/resolvePushCloudId';

/**
 * Cross-cloud push → dot mark (ADR-0056 결정 2). Mounted once under AppRuntime, alongside
 * `UnreadBadgeRunner`.
 *
 * Foreground only: a push arriving while backgrounded/killed never reaches this bridge at all
 * (see docs/mobile/push.md) — that path is recovered separately by draining the native mark store
 * on boot/foreground (docs/feature/home/unread-dot.md §5), wired once the native bridge lands.
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

    useEffect(() => {
        if (isVerified && selectedCloudId && activeBadged) clear(selectedCloudId);
    }, [isVerified, selectedCloudId, activeBadged, clear]);

    return null;
};
