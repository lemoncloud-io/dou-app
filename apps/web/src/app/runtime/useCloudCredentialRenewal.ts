import { useCloudCredentialGuard } from '@chatic/app-runtime';

import { useAppForeground } from '../bridge';

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
 */
export const useCloudCredentialRenewal = (): void => {
    const { check } = useCloudCredentialGuard();

    useAppForeground(() => {
        void check();
    });
};
