import { useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import {
    getSocketManager,
    isNativeApp,
    recoverInvitedCloudIfMissing,
    useRuntimeRepositories,
} from '@chatic/app-runtime';
import { logger } from '@chatic/bridges';
import { useGlobalSession, useSessionSelection, useSwitchCloudSession } from '@chatic/web-core';

import { useLogoutCloudSession } from '../../runtime/useLogoutCloudSession';
import { useSiteSwitch } from '../../runtime/useSiteSwitch';
import { resolvePushNavigation } from './resolvePushNavigation';
import { resolveThreadTarget } from './resolveThreadTarget';

/** Upper bound for awaiting the socket handshake before a push-driven cloud/site switch. */
const HANDSHAKE_WAIT_TIMEOUT_MS = 10_000;

/**
 * The backend push payload marks relay-origin messages with this literal `cid`. It exists only in
 * the push payload spec — it is NOT the session layer's internal `'default'` sentinel
 * (`getSelectedCloudId()`), so it must be interpreted here and never forwarded to session APIs.
 */
const RELAY_ORIGIN_CID = '#';

/**
 * Strips only the hash so push targets can be compared against the current location.
 * The query string must participate in the comparison: some targets (e.g. the invite
 * deeplink `/?provider=invite&code=...`) share a pathname with the current screen but
 * carry their whole meaning in query params — a pathname-only match would drop them.
 */
const toLocationKey = (target: string): string => target.split('#')[0];

/**
 * Is this pathname a channel room? Mirrors `ROUTES.channels.room` — kept as a pattern because the
 * route builder takes an id and this has to match any of them.
 *
 * Only a room is treated as a disposable history entry (see `navigateNormalized`): rooms are peers
 * that a push hops between, so stacking them buries the screen the user actually wants to return to.
 * Every other screen is somewhere the user chose to be.
 */
const isChannelRoomPath = (pathname: string): boolean => /^\/channels\/[^/]+\/room$/.test(pathname);

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
 * Relay-origin pushes carry the literal `cid` `'#'` (see RELAY_ORIGIN_CID) rather than a real
 * cloud id, so they must never reach `switchCloud`. When a cloud session is active they instead
 * leave the cloud via `logoutCloudSession()` — relay auth underpins the cloud session
 * (delegation-token exchange), so dropping the cloud is enough to land back in relay without a
 * re-login. When relay is already active, no transition is needed at all. (ADR-0045)
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
 * A push naming a specific chat (`chatId`) navigates in two legs — channel room, then the chat's
 * thread if it turns out to be a reply. See `hopToThread`; a top-level message simply stops at the
 * room, which is the common case.
 *
 * Must be used within the router tree (relies on `useNavigate`).
 */
export const usePushNavigate = (): ((rawPath: string) => Promise<void>) => {
    const navigate = useNavigate();
    const { selectedCloudId, selectedSiteId } = useSessionSelection();
    // Committed session truth for the relay-return decision: `kind` is 'cloud' only while the
    // cloud session is fully active (tokens present), unlike the selection-derived cloud id.
    const { activeServer } = useGlobalSession();
    const { switchCloud } = useSwitchCloudSession();
    const { logoutCloudSession } = useLogoutCloudSession();
    const { switchSite } = useSiteSwitch();
    // Cloud repository for invited-cloud recovery (see the switch block below); chat for
    // resolving whether a notified message is a thread reply (see `hopToThread`).
    const { cloud, chat: chatRepository } = useRuntimeRepositories();
    // One push navigation is processed at a time; overlapping events are dropped (see below).
    const inFlightRef = useRef(false);

    /**
     * Navigates to a push target while keeping "back" meaningful.
     *
     * - Already on the exact target (pathname + query): skip entirely — re-navigating would
     *   remount the page (scroll/input reset) and stack a duplicate history entry for the
     *   same screen. A matching pathname with a *different* query is NOT "already there":
     *   invite deeplinks land on `/` with their payload in query params, and skipping them
     *   used to silently swallow the invite popup when the user was already at home.
     * - Leaving a channel ROOM: REPLACE it. Rooms are peers a push hops between, so repeated
     *   taps would otherwise stack `[home, roomA, roomB, …]` and make "back" walk through stale
     *   rooms instead of leaving the chat.
     * - Anywhere else: PUSH, so the screen the user was on stays underneath and back returns to it.
     *
     * The second rule used to read "anywhere but home", which is what made back unusable: a push
     * tapped from `/mypage` REPLACED mypage, so back skipped it — and when mypage was the only
     * entry there was nothing left to go back to at all. Only a room is disposable; every other
     * screen is one the user chose.
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
            if (isChannelRoomPath(pathname)) {
                navigate(target, { replace: true });
            } else {
                navigate(target);
            }
        },
        [navigate]
    );

    /**
     * Second leg of a push into a thread reply: having landed on the channel room, ask whether
     * the notified chat is a reply and, if so, open its thread on top.
     *
     * Ordered after the room rather than instead of it, for three reasons. Back stays meaningful
     * (thread → room → wherever the reader came from). The room's own load is what warms the chat
     * cache this lookup reads. And an unresolvable chat degrades to a screen that is still right,
     * instead of a thread page with no root.
     *
     * PUSHED deliberately, not routed through `navigateNormalized`: that helper REPLACES the
     * current entry when it is a channel room, which is correct for the room-to-room hops it was
     * written for and wrong here — it would drop the room we just placed underneath and send back
     * to whatever preceded it.
     *
     * Silent on every failure. The reader is already on a screen that makes sense, so a missing
     * chat, a cold cache with no socket, or a rejected fetch all mean "no hop" rather than an
     * error to report. The location is re-checked first because the awaits above give the reader
     * time to navigate away, and hijacking a screen they chose would be worse than no hop at all.
     */
    const hopToThread = useCallback(
        async (chatId: string) => {
            try {
                if (!isChannelRoomPath(window.location.pathname)) return;
                // Cache first: after a push the row is usually already synced, and this avoids a
                // round trip. `getChat` is the cold-start path (cache miss / evicted history).
                const cached = await chatRepository.cacheRead(chatId);
                const target = resolveThreadTarget(cached ?? (await chatRepository.getChat({ id: chatId })), chatId);
                if (!target || !isChannelRoomPath(window.location.pathname)) return;
                logger.info('ROUTER', `Push points at a thread reply; opening thread: ${target}`);
                navigate(target);
            } catch (error) {
                logger.info('ROUTER', 'Could not resolve a thread for the pushed chat; staying in the room', {
                    data: { chatId },
                    error,
                });
            }
        },
        [chatRepository, navigate]
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

            const { target, cid, sid, chatId } = resolvePushNavigation(rawPath);
            logger.info('ROUTER', `Push navigation requested: ${rawPath}`, { target, cid, sid, chatId });

            // Relay-origin push (`cid === '#'`): return to relay when a cloud is active; when relay
            // is already active there is nothing to switch — the sentinel must never hit switchCloud.
            const isRelayPush = cid === RELAY_ORIGIN_CID;
            const needsRelayReturn = isRelayPush && activeServer.kind === 'cloud';
            const needsCloudSwitch = !!cid && !isRelayPush && cid !== selectedCloudId;
            const needsSiteSwitch = !!sid && sid !== selectedSiteId;
            const needsSwitch = needsRelayReturn || needsCloudSwitch || needsSiteSwitch;

            /**
             * Land on the resolved target, then take the thread leg when the push named a chat.
             * Every exit below routes through this so a reply push opens its thread whichever way
             * the switch went — including the best-effort paths, where the room still loads and the
             * hop can still succeed off the cache.
             */
            const land = async () => {
                navigateNormalized(target);
                if (chatId) await hopToThread(chatId);
            };

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
                        await land();
                        return;
                    }
                    // Native cold-DB eviction can drop an INVITED source cloud from the cache, so a
                    // deep-link / push-tap into it would have nothing to switch to. Re-derive and
                    // re-cache it first (idempotent: a no-op when already cached), mirroring the
                    // foreground-push recovery in InvitedCloudDurabilityRunner so both push entry
                    // points behave identically. Relay-backed, so it runs after the handshake gate.
                    if (cid && !isRelayPush && isNativeApp()) await recoverInvitedCloudIfMissing(cloud, cid);
                    // Cloud transition first (it clears the selected site), then site, then route.
                    if (needsRelayReturn) await logoutCloudSession();
                    if (cid && needsCloudSwitch) await switchCloud(cid);
                    if (sid && needsSiteSwitch) await switchSite(sid);
                }
                await land();
            } catch (error) {
                logger.error('ROUTER', `Failed to navigate to: ${target}`, { error });
                // Best-effort: attempt the route anyway so a switch failure doesn't strand the user.
                await land();
            } finally {
                inFlightRef.current = false;
            }
        },
        [
            navigateNormalized,
            hopToThread,
            selectedCloudId,
            selectedSiteId,
            activeServer.kind,
            switchCloud,
            logoutCloudSession,
            switchSite,
            cloud,
        ]
    );
};
