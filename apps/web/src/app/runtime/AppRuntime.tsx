import { Toaster as SonnerToaster } from 'sonner';

// Top-positioned toasts (in-app push banner) must clear the device notch/status bar.
// `--safe-top` is injected by the native WebView (see mobile injectionScripts.ts) and
// falls back to 0px in a plain browser. Only `top` is set, so bottom toasts keep
// sonner's defaults.
const SONNER_SAFE_OFFSET = { top: 'calc(var(--safe-top, 0px) + 8px)' };

import { GlobalLoader, useVersionCheck, VersionUpdateBanner } from '@chatic/shared';
import { Toaster } from '@chatic/ui-kit/components/ui/toaster';
import { RuntimeConnectionHost, useRuntimeBinding } from '@chatic/app-runtime';

import { Router } from '../routes';
import { ActiveCloudDataProvider, OtherCloudUnreadProvider } from '../hooks';
import { useAutoScrollOnFocus } from '../ui/hooks';
import { DebugObservationReporter } from '../features/debug';
import { CloudPushMarkRunner, UnreadBadgeRunner } from '../features/home';
import { BackgroundSyncRunner } from './BackgroundSyncRunner';
import { InvitedCloudDurabilityRunner } from './InvitedCloudDurabilityRunner';
import { MyUserSeedRunner } from './MyUserSeedRunner';
import { PreferenceLoader } from './PreferenceLoader';
import { useCloudCredentialRenewal } from './useCloudCredentialRenewal';
import { useRelayCredentialRefresh } from './useRelayCredentialRefresh';
import { useSocketWakeRecovery } from './useSocketWakeRecovery';

/**
 * Runtime layer — assembles the declarative `RuntimeConnectionHost` (transport bootstrap,
 * socket lifecycle and SDK-driven re-auth from the binding). Re-authentication on
 * site/cloud switch is handled internally — the app never sends `auth:update` itself, and the
 * socket session delegate is now owned by app-runtime (no delegate prop).
 *
 * Session readiness: `RuntimeConnectionHost` is the SINGLE web-core init driver (`useRelaySessionInit` →
 * `initializeRelaySession`) and gates its subtree until ready; `SessionBackgroundRunner` inside it
 * runs the background guest login when the relay session is absent. `AppReadyGate` then holds the UI
 * until the profile is ready so it never renders profile-less.
 */
export const AppRuntime = () => {
    const binding = useRuntimeBinding();
    const { hasUpdate, currentVersion, latestVersion, dismissUpdate } = useVersionCheck();

    // Global focus-scroll for all text fields (touch only; excludes [data-no-autoscroll]).
    useAutoScrollOnFocus();

    // Foreground wake kick: recycle bound-but-unverified sockets immediately on resume instead of
    // waiting for the keep-alive loop to notice the zombie. No-op before the sockets boot.
    useSocketWakeRecovery();

    // Ask the socket to re-mint stale relay HTTP signing credentials as soon as it verifies. The
    // sealed transport init no longer refreshes them and the SDK's first writeback is a refresh
    // cycle (5min) away, so without this every relay-signed request — notably the cloud entry
    // calls — 403s meanwhile.
    useRelayCredentialRefresh();

    // Cloud half of the same problem, different cure: a cloud credential that lapses while its socket
    // is down is RE-ISSUED from the relay identity (there is no refresh to ask for). Arms itself off
    // the credential's own expiry; no-op in a relay-only session.
    useCloudCredentialRenewal();

    return (
        <RuntimeConnectionHost binding={binding}>
            {/* One cloud-wide channel/read-cursor observation and one cross-cloud unread read for
                the whole app, above BOTH the badge runners and the router — the badge, the bottom
                nav and home each used to assemble the same numbers from their own subscriptions.
                A cache write re-renders these providers and their consumers only: `children` is one
                unchanged element, so the router subtree bails out. */}
            <ActiveCloudDataProvider>
                <OtherCloudUnreadProvider>
                    <PreferenceLoader />
                    <BackgroundSyncRunner />
                    <UnreadBadgeRunner />
                    <CloudPushMarkRunner />
                    <MyUserSeedRunner />
                    <InvitedCloudDurabilityRunner />
                    {/* Mirrors the two shared observations out to the debug overlay, which is mounted
                        outside AppRuntime and so cannot consume the providers. Nothing mounts below it
                        unless debug mode is unlocked. */}
                    <DebugObservationReporter />
                    <VersionUpdateBanner
                        isVisible={hasUpdate}
                        currentVersion={currentVersion}
                        latestVersion={latestVersion}
                        onDismiss={dismissUpdate}
                    />
                    <Router />
                    <GlobalLoader />
                    <SonnerToaster offset={SONNER_SAFE_OFFSET} mobileOffset={SONNER_SAFE_OFFSET} />
                    <Toaster />
                </OtherCloudUnreadProvider>
            </ActiveCloudDataProvider>
        </RuntimeConnectionHost>
    );
};
