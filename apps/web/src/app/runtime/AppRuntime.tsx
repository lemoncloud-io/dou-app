import { Toaster as SonnerToaster } from 'sonner';

import { GlobalLoader, useVersionCheck, VersionUpdateBanner } from '@chatic/shared';
import { Toaster } from '@chatic/ui-kit/components/ui/toaster';
import { RuntimeConnectionHost, useRuntimeBinding } from '@chatic/app-runtime';

import { Router } from '../routes';
import { PreferenceLoader } from './PreferenceLoader';
import { useSocketDelegate } from './useSocketDelegate';

/**
 * Runtime layer — assembles the declarative `RuntimeConnectionHost` (transport bootstrap,
 * socket lifecycle and re-auth from the binding + delegate). Re-authentication on
 * site/cloud switch is handled internally — the app never sends `auth:update` itself.
 *
 * Session readiness is owned here, not by a wrapping gate: `SessionBackgroundRunner` (inside
 * `RuntimeConnectionHost`) is the single owner of `useInitWebCore` / `useTokenRefresh`, which
 * drive guest login + profile load. `TransportBootstrap` shows the splash during webCore init,
 * then `AppReadyGate` holds it until the profile is ready so the UI never renders profile-less.
 */
export const AppRuntime = () => {
    const binding = useRuntimeBinding();
    const delegate = useSocketDelegate();
    const { hasUpdate, currentVersion, latestVersion, dismissUpdate } = useVersionCheck();

    return (
        <RuntimeConnectionHost binding={binding} delegate={delegate}>
            <PreferenceLoader />
            <VersionUpdateBanner
                isVisible={hasUpdate}
                currentVersion={currentVersion}
                latestVersion={latestVersion}
                onDismiss={dismissUpdate}
            />
            <Router />
            <GlobalLoader />
            <SonnerToaster />
            <Toaster />
        </RuntimeConnectionHost>
    );
};
