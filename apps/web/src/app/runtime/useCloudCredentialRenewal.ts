import { useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { runtime } from '@chatic/app-runtime';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import { useAppForeground } from '../bridge';
import { useCachedCloudNames } from '../hooks';
import { useSessionLogout } from './useSessionLogout';

/**
 * apps/web's policy for the cloud counterpart of `useRelayCredentialRefresh`.
 *
 * The hub hook arms itself off the credential's own `Expiration`, so there is no cadence to choose
 * here. What apps/web adds is the trigger the hub cannot see: **WebView foreground return**. A
 * suspended WebView does not fire its timers on time (and `visibilitychange` is not reliable in the
 * native shell), which is precisely the case this guard exists for — the credential lapses while the
 * app sleeps and the cloud socket is not there to re-mint it.
 *
 * Unlike the relay guard this never logs out and never tears the session down: losing a cloud is
 * recoverable by re-entering it, and `onAuthExpired` already owns the "give up on this cloud"
 * decision.
 *
 * The same foreground return re-checks the clouds this device entered through a pairing (the runtime
 * also checks them at mount and every ten minutes). One the relay stopped delegating — the approval
 * was revoked, or the approving device signed out — is torn down by the runtime; this says so and
 * signs the device out. An ended approval ends the sign-in it gave, and the relay goes on refusing
 * this auth session's way into that cloud — its own invite included — until a new one replaces it.
 */
export const useCloudCredentialRenewal = (): void => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const cachedCloudNames = useCachedCloudNames();
    const { check } = runtime.session.useCloudCredentialGuard();
    const logout = useSessionLogout();
    // One round can end several paired clouds; the device signs out once.
    const signingOut = useRef(false);
    const pairedCloudCheck = runtime.session.usePairedCloudCheck(cloudId => {
        const name = cachedCloudNames[cloudId];
        toast({ title: name ? t('pairing.cloud.endedNamed', { cloud: name }) : t('pairing.cloud.ended') });
        if (signingOut.current) return;
        signingOut.current = true;
        void logout().finally(() => {
            signingOut.current = false;
        });
    });

    useAppForeground(() => {
        void check();
        void pairedCloudCheck.check();
    });
};
