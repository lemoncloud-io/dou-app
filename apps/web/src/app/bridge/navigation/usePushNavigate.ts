import { useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import {
    getSocketManager,
    isNativeApp,
    recoverInvitedCloudIfMissing,
    useRuntimeRepositories,
} from '@chatic/app-runtime';
import { logger } from '@chatic/bridges';
import { useSessionSelection, useSwitchCloudSession } from '@chatic/web-core';

import { useSiteSwitch } from '../../runtime/useSiteSwitch';
import { resolvePushNavigation } from './resolvePushNavigation';
import { ROUTES } from '../../routes/paths';

/** Upper bound for awaiting the socket handshake before a push-driven cloud/site switch. */
const HANDSHAKE_WAIT_TIMEOUT_MS = 10_000;

/**
 * Strips only the hash so push targets can be compared against the current location.
 * The query string must participate in the comparison: some targets (e.g. the invite
 * deeplink `/?provider=invite&code=...`) share a pathname with the current screen but
 * carry their whole meaning in query params — a pathname-only match would drop them.
 */
const toLocationKey = (target: string): string => target.split('#')[0];

/**
 * Shared navigation primitive for push-originated route changes — native `OnNavigate`
 * events (push taps / deep links) and in-app notification clicks both funnel here so
 * every push entry point behaves identically.
 *
 * Push notifications can deep-link into a channel room that lives in a different cloud/site
 * than the one currently active. Channel data is loaded from the *active* server's repository,
 * so the target cloud/site must be switched *before* navigating — otherwise the room page
 * cannot find the channel and bounces back home. The cloud switch clears the selected site,
 * so the site switch is ordered after it, and both are awaited before the route change.
 *
 * A cloud/site switch re-issues tokens against the active server, so attempting it before the
 * base socket handshake completes (e.g. on cold start) races the connection and fails, which
 * rolls the selection back. We therefore wait for the handshake (`isVerified`) before switching;
 * if it does not complete within the timeout we skip the switch and navigate best-effort.
 *
 * Push-driven navigation also normalizes the history stack instead of plainly pushing: repeated
 * push taps used to stack room entries (`[home, roomA, roomB, ...]`) so "back" walked through
 * stale rooms instead of leaving the chat. See `navigateNormalized` — it replaces the current
 * entry rather than pushing, so the stack never grows on repeated taps.
 *
 * Overlapping push events are dropped: the store can deliver a duplicate/rapid second event while
 * the first is still awaiting a cloud/site switch, which would interleave switches and
 * double-navigate. An in-flight guard processes one push entry at a time.
 *
 * Must be used within the router tree (relies on `useNavigate`).
 */
export const usePushNavigate = (): ((rawPath: string) => Promise<void>) => {
    const navigate = useNavigate();
    const { selectedCloudId, selectedSiteId } = useSessionSelection();
    const { switchCloud } = useSwitchCloudSession();
    const { switchSite } = useSiteSwitch();
    // Cloud repository for invited-cloud recovery (see the switch block below).
    const { cloud } = useRuntimeRepositories();
    // One push navigation is processed at a time; overlapping events are dropped (see below).
    const inFlightRef = useRef(false);

    /**
     * Navigates to a push target without growing the history stack.
     *
     * - Already on the exact target (pathname + query): skip entirely — re-navigating would
     *   remount the page (scroll/input reset) and stack a duplicate history entry for the
     *   same screen. A matching pathname with a *different* query is NOT "already there":
     *   invite deeplinks land on `/` with their payload in query params, and skipping them
     *   used to silently swallow the invite popup when the user was already at home.
     * - At home (`/`): push the target, so home stays below it and back = home.
     * - Anywhere else: REPLACE the current entry with the target. On the shallow stacks push
     *   entry usually hits (`[home, room]`) this yields `[home, target]` (back = home), and —
     *   crucially — repeated push taps replace in place instead of stacking, so the history never
     *   grows and never accumulates duplicate `home` entries the way a rebase-then-push did.
     *
     * The current location is read from `window.location` (not `useLocation`) because this
     * runs after async cloud/site switches and must see the location at call time, not the
     * one captured when the handler was created. Safe under `createBrowserRouter`.
     */
    const navigateNormalized = useCallback(
        (target: string) => {
            const { pathname, search } = window.location;
            if (`${pathname}${search}` === toLocationKey(target)) {
                logger.info('ROUTER', `Already at push target; skipping navigation: ${target}`);
                return;
            }
            if (pathname === ROUTES.root) {
                navigate(target);
            } else {
                navigate(target, { replace: true });
            }
        },
        [navigate]
    );

    return useCallback(
        async (rawPath: string) => {
            // Drop overlapping push navigations: a duplicate/rapid second event arriving while the
            // first is still awaiting a cloud/site switch would interleave switches and
            // double-navigate. Process one push entry at a time.
            if (inFlightRef.current) {
                logger.info('ROUTER', `Push navigation already in flight; dropping: ${rawPath}`);
                return;
            }
            inFlightRef.current = true;

            const { target, cid, sid } = resolvePushNavigation(rawPath);
            logger.info('ROUTER', `Push navigation requested: ${rawPath}`, { target, cid, sid });

            const needsSwitch = (!!cid && cid !== selectedCloudId) || (!!sid && sid !== selectedSiteId);

            try {
                if (needsSwitch) {
                    // Gate the switch on the base handshake so we do not switch over a half-open socket.
                    const verified = await getSocketManager().waitUntilVerified(HANDSHAKE_WAIT_TIMEOUT_MS);
                    if (!verified) {
                        logger.warn('ROUTER', 'Socket handshake not verified before switch; navigating best-effort', {
                            target,
                            cid,
                            sid,
                        });
                        navigateNormalized(target);
                        return;
                    }
                    // Native cold-DB eviction can drop an INVITED source cloud from the cache, so a
                    // deep-link / push-tap into it would have nothing to switch to. Re-derive and
                    // re-cache it first (idempotent: a no-op when already cached), mirroring the
                    // foreground-push recovery in InvitedCloudColdSyncRunner so both push entry
                    // points behave identically. Relay-backed, so it runs after the handshake gate.
                    if (cid && isNativeApp()) await recoverInvitedCloudIfMissing(cloud, cid);
                    // Cloud first (it clears the selected site), then site, then route.
                    if (cid && cid !== selectedCloudId) await switchCloud(cid);
                    if (sid && sid !== selectedSiteId) await switchSite(sid);
                }
                navigateNormalized(target);
            } catch (error) {
                logger.error('ROUTER', `Failed to navigate to: ${target}`, { error });
                // Best-effort: attempt the route anyway so a switch failure doesn't strand the user.
                navigateNormalized(target);
            } finally {
                inFlightRef.current = false;
            }
        },
        [navigateNormalized, selectedCloudId, selectedSiteId, switchCloud, switchSite, cloud]
    );
};
