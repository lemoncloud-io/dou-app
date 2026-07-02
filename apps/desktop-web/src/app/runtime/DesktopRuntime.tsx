import { useEffect } from 'react';

import { RuntimeConnectionHost, useRuntimeBinding } from '@chatic/app-runtime';
import { useSessionAuth } from '@chatic/web-core';
import { Toaster } from '@chatic/ui-kit/components/ui/toaster';

import { AppRouter } from '../routes';
import {
    ConnectionBanner,
    UpdateBanner,
    useCrossCloudPushBadge,
    useCrossCloudPushToast,
    useDesktopBadge,
    useDesktopNotifications,
    useDeviceTokenRegistration,
    useMentionCapture,
    usePlaceUnreadCounts,
    useRefreshOnPush,
    useRetainLeavingCloudBadge,
    useSocketWedgeReload,
    useSyncNotificationPrefsToShell,
    useUnreadStore,
} from '../shared';
import { BackgroundSyncRunner } from './BackgroundSyncRunner';
import { useRealtimeProfileSync } from './useRealtimeProfileSync';
import { useSocketDelegate } from './useSocketDelegate';

/** Mounts desktop OS-notification wiring inside the runtime host (needs engine repositories). */
const DesktopNotifications = () => {
    useDesktopNotifications();
    // Realtime place-profile sync — re-pull on the server's sync-site-profile broadcast so a
    // peer's nick/photo edit surfaces live (v2 dropped the engine's realtime profile:sync path).
    useRealtimeProfileSync();
    // Cross-cloud push: register this device's FCM token with the broker.
    useDeviceTokenRegistration();
    // Cross-cloud push: in-app toast when focused (macOS hides OS banners then).
    useCrossCloudPushToast();
    // Cross-cloud push: mark the source cloud's rail tile until it's visited.
    useCrossCloudPushBadge();
    // Capture @me messages across all channels into the device-local Activity inbox.
    useMentionCapture();
    // A push means new activity the v2 socket won't stream for background channels — re-pull the
    // active cloud's channels so the unread badges update at push time, not 60s later.
    useRefreshOnPush();
    // Self-heal a socket left unverified after sleep/wake (cloud-token 400 loop)
    // by reloading the Electron renderer — automatic equivalent of a manual ctrl+r.
    useSocketWedgeReload();
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
    useRetainLeavingCloudBadge(total);
    useDesktopBadge(total);
    useEffect(() => {
        document.title = total > 0 ? `(${total > 99 ? '99+' : total}) DoU` : 'DoU';
    }, [total]);

    return null;
};

/**
 * Runtime layer — assembles the declarative `RuntimeConnectionHost` (transport bootstrap,
 * socket lifecycle and re-auth from the binding + delegate). Session readiness is owned here,
 * not by a wrapping gate in app.tsx: `SessionBackgroundRunner` (inside `RuntimeConnectionHost`)
 * owns `useInitWebCore` / `useTokenRefresh`; `TransportBootstrap` shows the splash during init.
 * The desktop notification / unread / connection runners self-gate on socket verification.
 */
export const DesktopRuntime = () => {
    const binding = useRuntimeBinding();
    const delegate = useSocketDelegate();
    // Mirror DND/global-switch prefs to the Electron main process, which raises
    // cross-cloud FCM banners itself. Always mounted (not auth-gated): DND must
    // keep gating shell banners on the logged-out screen too.
    useSyncNotificationPrefsToShell();

    return (
        <RuntimeConnectionHost binding={binding} delegate={delegate}>
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
