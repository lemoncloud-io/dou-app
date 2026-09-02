import { useEffect } from 'react';

import { useKindVerified, useSessionStalenessGuard } from '@chatic/app-runtime';

/**
 * Re-mints stale relay HTTP signing credentials (lemon-web-core's AWS credential cache).
 *
 * desktop-web had NO caller for this — apps/web (`useRelayCredentialRefresh`) and admin-v2
 * (`useRelaySessionGuard`) each grew one, and `useSessionStalenessGuard`'s own doc names this app as
 * the gap. The symptom that closed it: a cloud switch reported as a bare `AxiosError: Network Error`
 * with no status. `POST {relay}/users/0/delegate-cloud` is relay-SIGNED HTTP, and API Gateway
 * rejects a stale/absent SigV4 signature at the IAM layer with a 403 that carries no
 * `access-control-allow-origin` — so the browser blocks the response and axios can only report
 * ERR_NETWORK. Every relay-signed call in that window fails the same way; cloud entry is just the
 * first one a user touches.
 *
 * The policy mirrors apps/web, because the two apps answer the underlying questions identically:
 *
 * **Rising edge of relay verification, not an interval.** `requestRelaySessionRefresh` only reaches the
 * refresh OWNER (the SDK AuthController) when a live authenticated socket exists, so polling at
 * mount would just log failures until the handshake completes.
 *
 * **Visibility return**, because a socket that survived sleep fires no rising edge, yet the
 * credential may have lapsed while the machine was suspended. This is the desktop analogue of
 * apps/web's WebView-foreground trigger — the same edge, from the source this shell actually has.
 * `useSocketWakeRecovery` next door only heals the SOCKET; the AWS credential is a separate cache.
 * Gated on the socket being verified for the same reason apps/web gates its foreground trigger:
 * `check` cannot reach the refresh owner without a live socket, so an ungated visibility return —
 * the state a machine wakes up in — would only log a failure. The rising edge above covers that
 * case the moment the socket comes back.
 *
 * **Never logs out.** Relay logout is manual-only here, same as apps/web, so a failed refresh just
 * retries on the next edge.
 */
export const useRelayCredentialRefresh = (): void => {
    const { check } = useSessionStalenessGuard({
        intervalMs: null,
        checkOnRelayVerified: true,
        // Visibility is driven below instead of by the hub's own listener, which cannot see whether
        // this shell's socket is up.
        checkOnVisible: false,
        // Both triggers are EDGES, and at exactly those moments the stored `expired_time` is a bad
        // proxy for "the credential still signs": the handshake's `auth.update` emits no token, so
        // boot runs on the pre-sleep credential until the SDK's own 5-min timer fires. Refresh
        // regardless of the expiry probe — the hub throttles this to once a minute and never counts
        // a preemptive miss as a failure.
        forceRefresh: true,
        consecutiveFailureLimit: null,
    });

    const isRelayVerified = useKindVerified('relay');
    useEffect(() => {
        const onVisibilityChange = (): void => {
            if (document.visibilityState !== 'visible' || !isRelayVerified) return;
            void check();
        };
        document.addEventListener('visibilitychange', onVisibilityChange);
        return () => document.removeEventListener('visibilitychange', onVisibilityChange);
    }, [check, isRelayVerified]);
};
