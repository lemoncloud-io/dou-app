import { useEffect, useMemo } from 'react';

import { RuntimeConnectionHost, useRuntimeBinding } from '@chatic/app-runtime';
import { useSessionAuth } from '@chatic/web-core';
import { Toaster } from '@chatic/ui-kit/components/ui/toaster';

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
 * `RuntimeConnectionHost`, which is the single web-core init driver (`useInitWebCore`) and builds
 * its own socket session delegate internally — apps no longer inject one. The desktop notification /
 * unread / connection runners self-gate on socket verification.
 */
export const DesktopRuntime = () => {
    const binding = useRuntimeBinding();

    return (
        <RuntimeConnectionHost binding={binding}>
            <BackgroundSyncRunner />
            <AuthedNotifications />
            <ShellUnreadSync />
            <ConnectionBanner />
            {/* Desktop auto-update banner — always mounted (no-op in browser). */}
            <UpdateBanner />
            <AppRouter />
            <Toaster />
        </RuntimeConnectionHost>
    );
};
