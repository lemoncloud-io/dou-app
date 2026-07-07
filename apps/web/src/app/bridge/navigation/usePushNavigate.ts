import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import { getSocketManager } from '@chatic/app-runtime';
import { logger } from '@chatic/bridges';
import { useSessionSelection, useSiteSwitch, useSwitchCloudSession } from '@chatic/web-core';

import { resolvePushNavigation } from './resolvePushNavigation';
import { ROUTES } from '../../routes/paths';

/** Upper bound for awaiting the socket handshake before a push-driven cloud/site switch. */
const HANDSHAKE_WAIT_TIMEOUT_MS = 10_000;

/** Strips query/hash so push targets can be compared against the current pathname. */
const toPathname = (target: string): string => target.split(/[?#]/)[0];

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
 * Push-driven navigation also normalizes the history stack instead of plainly pushing:
 * repeated push taps used to stack room entries (`[home, roomA, roomB, ...]`) so "back" walked
 * through stale rooms instead of leaving the chat. The rule here is the messenger convention —
 * entering via a push deep link always means back = home. See `navigateNormalized`.
 *
 * Must be used within the router tree (relies on `useNavigate`).
 */
export const usePushNavigate = (): ((rawPath: string) => Promise<void>) => {
    const navigate = useNavigate();
    const { selectedCloudId, selectedSiteId } = useSessionSelection();
    const { switchCloud } = useSwitchCloudSession();
    const { switchSite } = useSiteSwitch();

    /**
     * Navigates to a push target with the back stack normalized to `[..., home, target]`.
     *
     * - Already on the target screen: skip entirely — re-navigating would remount the page
     *   (scroll/input reset) and stack a duplicate history entry for the same room.
     * - Otherwise rebase the *current* entry to home (`replace`) before pushing the target,
     *   so back always lands on home no matter how deep the user was when tapping the push.
     *
     * The current pathname is read from `window.location` (not `useLocation`) because this
     * runs after async cloud/site switches and must see the location at call time, not the
     * one captured when the handler was created. Safe under `createBrowserRouter`.
     */
    const navigateNormalized = useCallback(
        (target: string) => {
            const currentPathname = window.location.pathname;
            if (currentPathname === toPathname(target)) {
                logger.info('ROUTER', `Already at push target; skipping navigation: ${target}`);
                return;
            }
            if (currentPathname !== ROUTES.root) {
                navigate(ROUTES.root, { replace: true });
            }
            navigate(target);
        },
        [navigate]
    );

    return useCallback(
        async (rawPath: string) => {
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
                    // Cloud first (it clears the selected site), then site, then route.
                    if (cid && cid !== selectedCloudId) await switchCloud(cid);
                    if (sid && sid !== selectedSiteId) await switchSite(sid);
                }
                navigateNormalized(target);
            } catch (error) {
                logger.error('ROUTER', `Failed to navigate to: ${target}`, { error });
                // Best-effort: attempt the route anyway so a switch failure doesn't strand the user.
                navigateNormalized(target);
            }
        },
        [navigateNormalized, selectedCloudId, selectedSiteId, switchCloud, switchSite]
    );
};
