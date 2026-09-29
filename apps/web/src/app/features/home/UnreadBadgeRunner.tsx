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
 * The number is the sum over every cloud the account is in, each counted from its own cache: the
 * active cloud by `ActiveCloudDataProvider`, every other one by `OtherCloudUnreadProvider`, both
 * with the same formula. A read drops the badge immediately; a message arriving in a cloud off
 * screen raises it once that cloud's background delta lands — within its receive interval, sooner
 * when a push names it.
 *
 * The badge used to add a localStorage snapshot of each cloud's last-visited count, which nothing
 * ever cleared — a count frozen when you switched away sat on the app icon indefinitely. Counting
 * from the cache has no frozen entry to strand.
 */
export const UnreadBadgeRunner = (): null => {
    // Shared with HomePage's `byPlace` (ADR-0056) — see useActiveCloudUnreads for why this stays
    // observe-only (no per-channel join sync registration lives here).
    const { total } = useActiveCloudUnreads();
    const { total: otherTotal } = useOtherCloudUnread();

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

    // Foreground reconcile: re-assert the authoritative count even when the totals have not
    // changed. While backgrounded the native badge drifts away from the truth — iOS zeroes it on
    // becomeActive and both platforms increment it per push — so the effect above (which only fires
    // on a change) is not enough to correct it. Re-pushing here overwrites the drift and resets the
    // native increment base for the next background session.
    useOnBackgroundStatusChanged(message => {
        if (message.data.isForeground) {
            // Check before the overwrite: this is the moment the background drift is still visible.
            void checkBadge();
            pushBadge();
        }
    });

    return null;
};
