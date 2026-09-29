import { useCallback, useEffect, useMemo, useRef } from 'react';

import { runtime } from '@chatic/app-runtime';
import { logger } from '@chatic/bridges';
import { useCloudSessionCatalog } from '../../hooks/useCloudCatalog';
import type { AppMessageData } from '@chatic/app-messages';

import { appBridge } from '../../bridge/appBridge';
import { useOnBackgroundStatusChanged, useOnReceiveNotification } from '../../bridge/useHandleAppMessage';
import { extractPushCloudHint } from '../../utils/resolveInAppPushRoute';
import { useInvitedClouds } from '../../hooks';
import { useJoinedCloudIds } from '../../hooks/useJoinedCloudIds';
import { useCloudPushMarkStore } from './stores/useCloudPushMarkStore';
import { isChatPush } from './utils/isChatPush';
import { RELAY_CLOUD_ID, resolvePushCloudId } from './utils/resolvePushCloudId';

/**
 * Cross-cloud push → dot mark. Mounted once under AppRuntime, alongside `UnreadBadgeRunner`.
 *
 * Two arrival paths feed the same mark store:
 * - **Foreground**: `OnReceiveNotification` resolves the source cloud immediately. Only a chat push
 *   may mark (`isChatPush`) — a cloud-activation push names a cloud with nothing unread in it.
 * - **Background/killed**: never reaches this bridge at all (see docs/mobile/push.md) — the
 *   native shell (iOS NSE / Android FCM service) records the raw hint instead, and this runner
 *   drains that store (`appBridge.fetchPushMarks`, read+clear in one call) on mount — by the time
 *   this runner mounts inside `RuntimeConnectionHost`, the `WebAppReady` handshake has already
 *   completed, so a plain mount-effect IS "after boot" — and again on every foreground return,
 *   since a mark can land while the app was merely backgrounded (not killed).
 *
 * A push naming the ACTIVE cloud is never marked — the live socket already owns that cloud's
 * unread state.
 *
 * **A mark is a bridge, not a record.** It exists for the gap between hearing of a message and that
 * message being in the cloud's cache, where `OtherCloudUnreadProvider` counts it. A cloud off screen
 * is not sent the message on its socket, so its background loop would only pick it up on its next
 * minute tick; marking asks that cloud for its delta right away instead
 * (`refreshBackgroundClouds(cid)`) — a delta that re-reads its place list too, so the message's room is
 * not filtered out — and the mark is cleared by the first delta whose request went out AFTER the
 * mark, the one that is sure to carry the message, after a short grace for the observer to redraw. From there the cache's count keeps
 * the dot on for as long as the message is unread, and takes it off when it is read, including on
 * another device. Comparing against the request time rather than the answer time is what keeps a
 * delta already in flight when the push landed from clearing the mark without the message.
 *
 * A cloud with no socket slot — past the background cap, or with no tokens yet — never answers a
 * delta, so its mark stays until the user enters it, as every mark used to.
 *
 * Entering a marked cloud clears it too. That is a standing effect keyed on
 * `(isVerified && activeBadged)`, not the switch edge: a mark that lands for the cloud you are
 * ALREADY looking at (a push resolved slightly after the socket verified) still gets swept, because
 * the condition re-evaluates on every state change. Firing on the edge alone was the confirmed bug
 * in the desktop reference this was ported from.
 */
/**
 * How long a mark outlives the delta that retires it: long enough for the cloud's cache observer to
 * re-read and redraw (a trailing debounce of tens of milliseconds, then a storage read), short enough
 * that nobody sees a dot that has nothing behind it.
 */
const MARK_CLEAR_GRACE_MS = 1_000;

export const CloudPushMarkRunner = (): null => {
    const { selectedCloudId } = runtime.session.useSessionSelection();
    const { isVerified } = runtime.connection.useRuntimeSocketState();
    const { clouds: ownedClouds } = useCloudSessionCatalog();
    const { invitedClouds } = useInvitedClouds();
    const { resolveContext } = runtime.data.useGlobalCacheSearch();

    const markInStore = useCloudPushMarkStore(s => s.mark);
    const clear = useCloudPushMarkStore(s => s.clear);
    const activeBadged = useCloudPushMarkStore(s => (selectedCloudId ? !!s.badged[selectedCloudId] : false));

    /**
     * cloudId → when it was last marked in this run. A mark restored from the previous run has no
     * entry and reads as marked at mount: any delta asked for after that is newer than its push.
     */
    const markedAtRef = useRef(new Map<string, number>());
    const mountedAtRef = useRef(Date.now());

    const mark = useCallback(
        (cloudId: string) => {
            // The latest push is the one the clearing delta has to postdate, so a repeat moves the time.
            markedAtRef.current.set(cloudId, Date.now());
            markInStore(cloudId);
            runtime.sync.refreshBackgroundClouds(cloudId);
        },
        [markInStore]
    );

    useEffect(() => {
        const timers = new Set<ReturnType<typeof setTimeout>>();
        const unsubscribe = runtime.sync.subscribeBackgroundDeltas(({ cid, requestedAt }) => {
            if (requestedAt < (markedAtRef.current.get(cid) ?? mountedAtRef.current)) return;
            // Not at once: the rows are in storage when this is announced, but the cloud's observer
            // re-reads them after its own short debounce, and clearing first would take the dot off
            // for that moment and put it back. Re-checked when the grace ends, because a push that
            // lands meanwhile needs a delta of its own.
            const timer = setTimeout(() => {
                timers.delete(timer);
                if (requestedAt < (markedAtRef.current.get(cid) ?? mountedAtRef.current)) return;
                markedAtRef.current.delete(cid);
                clear(cid);
            }, MARK_CLEAR_GRACE_MS);
            timers.add(timer);
        });
        return () => {
            unsubscribe();
            for (const timer of timers) clearTimeout(timer);
        };
    }, [clear]);

    // Every cloud the account might belong to — owned + invited + relay. Deliberately not narrowed
    // to "other than active": resolution doesn't know which cloud is active, `apply` below does.
    const joinedCloudIds = useJoinedCloudIds(ownedClouds, invitedClouds);
    const cids = useMemo(() => [RELAY_CLOUD_ID, ...joinedCloudIds], [joinedCloudIds]);
    // Joined so the callback only changes identity on membership changes, not on every render's
    // new array/Set.
    const cidsKey = cids.join(',');

    const handleReceiveNotification = useCallback(
        (message: AppMessageData<'OnReceiveNotification'>) => {
            const data = message.data?.notification?.data;
            if (!data || !isChatPush(data)) return;

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
        // The only trace a background arrival ever leaves on the web, recorded here because the
        // drain is destructive — read and clear in one native call, so this is the one moment the
        // records exist on this side (ADR-0099). On iOS the notification-service extension runs in
        // its own process and cannot reach the logger at all, which makes this the sole evidence
        // that those pushes arrived.
        //
        // The count is a LOWER BOUND: the shell skips a record whose payload carries none of
        // cid/uid/channelId, and the store holds at most 100 with oldest-first eviction. Cloud ids
        // only — the records also carry a channel name, which is content.
        if (records.length > 0) {
            logger.info('PUSH_EVENT', `drained ${records.length} background push mark(s) (lower bound)`, {
                count: records.length,
                cids: records.map(record => record.cid).filter(Boolean),
            });
        }
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
