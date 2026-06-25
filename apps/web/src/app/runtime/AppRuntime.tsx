import { Toaster as SonnerToaster } from 'sonner';

import { GlobalLoader, useVersionCheck, VersionUpdateBanner } from '@chatic/shared';
import { Toaster } from '@chatic/ui-kit/components/ui/toaster';
import { RuntimeConnectionHost, useRuntimeBinding } from '@chatic/app-runtime';

import { Router } from '../routes';
import { PreferenceLoader } from './PreferenceLoader';
import { useSocketDelegate } from './useSocketDelegate';

/**
 * Runtime layer mounted once the session is ready (under `SessionGate`).
 *
 * Replaces the imperative `runtimeManager.ensure()` + conditional `WebSocketV2Connection`
 * with the declarative `RuntimeConnectionHost`, which assembles transport bootstrap,
 * socket lifecycle and re-auth from the binding + delegate. Re-authentication on
 * site/cloud switch is handled internally — the app never sends `auth:update` itself.
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
