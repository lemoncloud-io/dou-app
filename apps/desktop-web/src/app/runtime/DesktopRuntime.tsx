import { useEffect, useMemo } from 'react';

import { RuntimeConnectionHost, useCloudCredentialGuard, useRuntimeBinding } from '@chatic/app-runtime';
import { useSessionAuth } from '@chatic/app-runtime';
import { Toaster } from '@chatic/ui-kit/components/ui/toaster';
import { TooltipProvider } from '@chatic/ui-kit/components/ui/tooltip';

import { AppRouter } from '../routes';
import {
    ConnectionBanner,
    UpdateBanner,
    useClouds,
    useCrossCloudPushBadge,
    useCrossCloudPushNotifications,
    useDesktopBadge,
    useDesktopNotifications,
    useDeviceTokenRegistration,
    useMentionCapture,
    usePlaceUnreadCounts,
    useRefreshOnPush,
    useChatOutbox,
    useCloudPushBadgeStore,
    useRetainLeavingCloudBadge,
    useSocketWakeRecovery,
    useSocketWedgeReload,
    useUnreadStore,
    startSocketFrameLog,
} from '../shared';
import { BackgroundSyncRunner } from './BackgroundSyncRunner';
import { useRealtimeProfileSync } from './useRealtimeProfileSync';
import { useRelayCredentialRefresh } from './useRelayCredentialRefresh';

// Debug frame log: start recording inbound socket envelopes for the whole session, so the
// debug page opens onto a buffer that was already filling. Module-scope (not an effect) —
// it binds through subscribeClient and is idempotent per client, and must not be tied to a
// component's lifetime.
startSocketFrameLog();

/** Mounts desktop OS-notification wiring inside the runtime host (needs engine repositories). */
const DesktopNotifications = () => {
    useDesktopNotifications();
    // Realtime place-profile sync — re-pull on the server's sync-site-profile broadcast so a
    // peer's nick/photo edit surfaces live (v2 dropped the engine's realtime profile:sync path).
    useRealtimeProfileSync();
    // Cross-cloud push: register this device's FCM token with the broker.
    useDeviceTokenRegistration();
    // Cross-cloud push: toast when focused, OS banner when not (the shell only forwards).
    useCrossCloudPushNotifications();
    // Cross-cloud push: mark the source cloud's rail tile until it's visited.
    useCrossCloudPushBadge();
    // Capture @me messages across all channels into the device-local Activity inbox.
    useMentionCapture();
    // A push means new activity the v2 socket won't stream for background channels — re-pull the
    // active cloud's channels so the unread badges update at push time, not 60s later.
    useRefreshOnPush();
    // On wake/refocus/online, reconnect + re-auth the live WS immediately (still-valid
    // token case) instead of waiting on the ~60s periodic heal.
    useSocketWakeRecovery();
    // Self-heal a socket left unverified after sleep/wake (cloud-token 400 loop)
    // by reloading the Electron renderer — automatic equivalent of a manual ctrl+r.
    useSocketWedgeReload();
    // Offline outbox: once the socket is verified again, re-send the messages that failed
    // while it was down. Desktop-only opt-in — apps/web keeps its manual resend button.
    useChatOutbox();
    return null;
};

/**
 * Gate the notification wiring on a live session. The Electron FCM receiver keeps running and the
 * device stays registered after logout, so without this the previous user's pushes would still
 * raise toasts/badges/OS banners on the logged-out shell. Unmounting drops the OnReceiveNotification
 * listeners so a logged-out app silently ignores inbound pushes; it re-registers on the next login.
 */
const AuthedNotifications = () => {
    const { isAuthenticated } = useSessionAuth();
    return isAuthenticated ? <DesktopNotifications /> : null;
};

/**
 * Always-mounted unread sync: runs the per-place unread aggregation once and publishes it to
 * useUnreadStore, then mirrors the total onto the OS badge and the window title. Lives here
 * (not in HomePage) so the badge/title keep updating on /profile and /settings where HomePage
 * is unmounted.
 */
const ShellUnreadSync = () => {
    const byPlace = usePlaceUnreadCounts();
    const setByPlace = useUnreadStore(s => s.setByPlace);
    useEffect(() => {
        setByPlace(byPlace);
    }, [byPlace, setByPlace]);

    const total = Object.values(byPlace).reduce((sum, n) => sum + n, 0);
    // Keep a cloud's rail dot when switching away from it with unread still pending.
    // Operates on the active-cloud total (its own concern), not the cross-cloud sum.
    useRetainLeavingCloudBadge(total);

    // The live socket only counts the active cloud; other clouds surface as boolean
    // push badges (no count). Fold each into the OS dock badge as +1 so the dock
    // reflects cross-cloud activity instead of reading 0 while other clouds wait —
    // an approximation (cloud count, not message count), same as the rail dots.
    //
    // Count only badged clouds that are (a) NOT the active one — its unread is already
    // in `total` — and (b) a REAL cloud present in the rail. A stray self-mark during a
    // relay-fallback window, or a foreign/stale cloud id the backend stamped into
    // `data.cid` (or a cloud that no longer exists), can never be visited to clear it, so
    // it would fold a permanent +1 into the dock badge — the "stuck at 1 with everything
    // read" bug. Filtering to real, non-active clouds drops those dead flags.
    const { clouds, activeCloudId } = useClouds();
    const railCloudIds = useMemo(() => new Set(clouds.map(c => c.id)), [clouds]);
    const badgedClouds = useCloudPushBadgeStore(s => s.badged);
    const crossCloudCount = Object.keys(badgedClouds).filter(id => id !== activeCloudId && railCloudIds.has(id)).length;
    const badgeTotal = total + crossCloudCount;
    useDesktopBadge(badgeTotal);
    useEffect(() => {
        document.title = badgeTotal > 0 ? `(${badgeTotal > 99 ? '99+' : badgeTotal}) DoU` : 'DoU';
    }, [badgeTotal]);

    return null;
};

/**
 * Runtime layer — assembles the declarative `RuntimeConnectionHost` (transport bootstrap,
 * socket lifecycle and re-auth from the binding). Session readiness is owned by
 * `RuntimeConnectionHost`, which is the single web-core init driver (`useRelaySessionInit`) and builds
 * its own socket session delegate internally — apps no longer inject one. The desktop notification /
 * unread / connection runners self-gate on socket verification.
 */
export const DesktopRuntime = () => {
    const binding = useRuntimeBinding();

    // Ask the socket to re-mint stale relay HTTP signing credentials as soon as it verifies (and on
    // return from sleep). The sealed transport init no longer refreshes them and the SDK's first
    // writeback is a refresh cycle (5min) away, so without this every relay-signed request — the
    // cloud switch's `delegate-cloud` first among them — 403s meanwhile, and a 403 with no CORS
    // header reaches the app as a bare `Network Error`.
    useRelayCredentialRefresh();

    // The cloud half of the same problem. A cloud AWS credential also lives about an hour, and the
    // only thing that re-mints it mid-session is the cloud socket's refresh writeback — so a session
    // that stays inside one cloud (or whose cloud socket drops) simply lets it lapse, and every
    // cloud-signed request 403s the same opaque way. Re-entering a cloud hid this, because entering
    // re-issues.
    //
    // Called with no policy, unlike the relay hook next door, and the difference is not an oversight:
    //  - The hub arms itself off the credential's own `Expiration`, so there is no cadence to pick.
    //  - `checkOnVisible` defaults to true and this shell gets real `visibilitychange` events, so the
    //    wake-from-sleep trigger needs no local wiring (apps/web only adds one because a native
    //    WebView does not fire it reliably).
    //  - It must NOT be gated on the cloud socket. Cloud recovery is a RE-ISSUE from the relay
    //    identity, not a refresh, so it works precisely when that socket is down — which is the case
    //    this guard exists for. Gating it the way the relay hook gates its visibility trigger would
    //    disable it exactly when it is needed.
    useCloudCredentialGuard();

    return (
        <RuntimeConnectionHost binding={binding}>
            {/* One provider for the whole app: Radix tooltip roots require an ancestor
                provider, and a chat pane renders dozens of message toolbars at once.
                `delayDuration` is short because these tooltips name icon-only controls —
                the label is the only way to learn what a button does. */}
            <TooltipProvider delayDuration={300}>
                <BackgroundSyncRunner />
                <AuthedNotifications />
                <ShellUnreadSync />
                <ConnectionBanner />
                {/* Desktop auto-update banner — always mounted (no-op in browser). */}
                <UpdateBanner />
                <AppRouter />
                <Toaster />
            </TooltipProvider>
        </RuntimeConnectionHost>
    );
};
