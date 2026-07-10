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
import { UnreadBadgeRunner } from '../features/home';
import { BackgroundSyncRunner } from './BackgroundSyncRunner';
import { MyUserSeedRunner } from './MyUserSeedRunner';
import { PreferenceLoader } from './PreferenceLoader';

/**
 * Runtime layer — assembles the declarative `RuntimeConnectionHost` (transport bootstrap,
 * socket lifecycle and SDK-driven re-auth from the binding). Re-authentication on
 * site/cloud switch is handled internally — the app never sends `auth:update` itself, and the
 * socket session delegate is now owned by app-runtime (no delegate prop).
 *
 * Session readiness is owned here, not by a wrapping gate: `SessionBackgroundRunner` (inside
 * `RuntimeConnectionHost`) is the single owner of `useInitWebCore` / `useTokenRefresh`, which
 * drive guest login + profile load. `TransportBootstrap` shows the splash during webCore init,
 * then `AppReadyGate` holds it until the profile is ready so the UI never renders profile-less.
 */
export const AppRuntime = () => {
    const binding = useRuntimeBinding();
    const { hasUpdate, currentVersion, latestVersion, dismissUpdate } = useVersionCheck();

    return (
        <RuntimeConnectionHost binding={binding}>
            <PreferenceLoader />
            <BackgroundSyncRunner />
            <UnreadBadgeRunner />
            <MyUserSeedRunner />
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
        </RuntimeConnectionHost>
    );
};
