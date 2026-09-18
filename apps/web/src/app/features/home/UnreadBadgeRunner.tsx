import { useCallback, useEffect, useRef } from 'react';

import { appBridge } from '../../bridge/appBridge';
import { useOnBackgroundStatusChanged } from '../../bridge/useHandleAppMessage';
import { useActiveCloudUnreads, useOtherCloudUnread } from '../../hooks';
import { divergenceReporter } from '../../runtime/logging/divergenceReporter';
import { nativeBadgeReader } from '../../runtime/logging/nativeBadgeReader';

/**
 * App-global unread badge. Mounted once under AppRuntime (not the home page) so the native
 * app-icon badge stays correct on every route.
 *
 * The number is two halves. The active cloud is observed live — its channel list and my join
 * cursors stream from the cache, so a read drops the badge immediately. Every other cloud is read
 * from the local cache by `useOtherCloudUnread`, recomputed from each channel's head and my read
 * cursor rather than remembered as a total.
 *
 * That second half used to be a localStorage snapshot of each cloud's last-visited count, and
 * nothing ever cleared an inactive cloud's entry — a count frozen when you switched away sat on
 * the app icon indefinitely, which is the phantom badge people saw after reading everything.
 * Recomputing has no frozen entry to strand: it follows the cache, and an inactive cloud that
 * leaves the cache leaves the count.
 *
 * The cache is still only as fresh as that cloud's last visit — messages that arrived since, or
 * reads made on another device, are invisible until it is opened again. Closing that gap needs a
 * server-side summary and cannot be done from the client.
 */
export const UnreadBadgeRunner = (): null => {
    // Shared with HomePage's `byPlace` (ADR-0056) — see useActiveCloudUnreads for why this stays
    // observe-only (no per-channel join sync registration lives here).
    const { total } = useActiveCloudUnreads();
    const { total: otherTotal, refresh: refreshOtherClouds } = useOtherCloudUnread();

    /**
     * The value the device was last told to show. Badge divergence is checked against THIS, never
     * against the current total: the write below is one-way and the device is expected to lag a
     * fresh read by design, so comparing the live total against the icon would flag every legitimate
     * read as a mismatch. Comparing against the last pushed value asks the only sound question —
     * "is the device still showing what we told it?" — and needs no timing guess.
     */
    const lastPushedRef = useRef<number | null>(null);

    const pushBadge = useCallback(() => {
        const next = total + otherTotal;
        appBridge.setBadgeCount(next);
        lastPushedRef.current = next;
    }, [total, otherTotal]);

    /**
     * Badge divergence (ADR-0099): read the icon BEFORE overwriting it, and compare with what it
     * should already be showing. On the first push there is no previous value, so the total about to
     * be written stands in — on a cold start that total is the truth and the icon carries whatever
     * the background push handler left there, which is the mismatch users report as "the badge did
     * not clear when I read everything".
     *
     * `nativeBadgeReader` answers `null` on a plain browser, on a shell that cannot report its
     * badge, and on any platform whose real value is unreadable — and the reporter treats `null` as
     * "skip" rather than zero.
     */
    const checkBadge = useCallback(async () => {
        const expected = lastPushedRef.current ?? total + otherTotal;
        const native = await nativeBadgeReader.read();
        divergenceReporter.badge({ web: expected, native, active: total, others: otherTotal });
    }, [total, otherTotal]);

    // First push of this app run: check what the icon carries over from the previous run, then
    // overwrite it. Deliberately mount-only — a check on every total change would race the
    // fire-and-forget write it follows.
    const didCheckOnMountRef = useRef(false);
    useEffect(() => {
        if (didCheckOnMountRef.current) return;
        didCheckOnMountRef.current = true;
        void checkBadge();
    }, [checkBadge]);

    useEffect(() => {
        pushBadge();
    }, [pushBadge]);

    // The active cloud's count moving is the app's best hint that the cache changed at all — a
    // send, a read, an arriving message. Re-read the other clouds on the same beat so a cloud
    // synced in the background (push recovery, cold sync) does not wait for a switch to show up.
    // `refresh` coalesces: a burst of arriving messages produces one cross-cloud scan, not one per
    // message (each scan reads every inactive cloud's partitions in full).
    useEffect(() => {
        refreshOtherClouds();
    }, [total, refreshOtherClouds]);

    // Foreground reconcile: re-assert the authoritative count even when the totals have not
    // changed. While backgrounded the native badge drifts away from the truth — iOS zeroes it on
    // becomeActive and both platforms increment it per push — so the effect above (which only fires
    // on a change) is not enough to correct it. Re-pushing here overwrites the drift and resets the
    // native increment base for the next background session.
    useOnBackgroundStatusChanged(message => {
        if (message.data.isForeground) {
            // Check before the overwrite: this is the moment the background drift is still visible.
            void checkBadge();
            refreshOtherClouds();
            pushBadge();
        }
    });

    return null;
};
