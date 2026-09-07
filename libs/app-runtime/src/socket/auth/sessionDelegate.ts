// The session half of the bridge — seed · sign · writeback (ADR-0074 결정 5). Runtime-internal and
// off the session barrel (결정 6).
import { sessionAuthAdapter } from '../../session/auth/sessionAuthAdapter';
// Terminal-expiry policy belongs to the per-server renewer (ADR-0074 결정 3), which takes the
// store-only teardown path on purpose: `onAuthExpired` runs on the socket that just died, so
// notifying it again (what the app-facing `logoutSession`/`logoutCloudSession` do) is pointless.
import { credentialRenewers } from './renewers';

import type { SocketSessionDelegate } from './types';

/**
 * Builds the socket session delegate that bridges the SDK AuthController (wired by
 * bootstrapSocketConnection) to web-core's PER-SERVER auth helpers. Every method is keyed by the
 * socket's kind, so the relay and cloud sockets each seed/sign/write-back against their own server.
 *
 * Module-level (not a hook) so non-React callers — applySessionToken — can build the same delegate;
 * the React side wraps it in useSocketSessionDelegate. Every member is a module-level web-core
 * function, so instances are interchangeable and carry no state.
 */
export const createSocketSessionDelegate = (): SocketSessionDelegate => ({
    getAuthRegistration: kind => sessionAuthAdapter.getAuthRegistration(kind),
    signAuth: (kind, _token, target) => sessionAuthAdapter.signAuth(kind, target),
    // Routed by the socket's own kind (§6-6). The SDK AuthTokenView is not exported from the
    // package root; the session boundary casts it to its own UserTokenView here.
    commitRefreshedToken: (kind, view) =>
        sessionAuthAdapter.commitRefreshedToken(
            kind,
            view as Parameters<typeof sessionAuthAdapter.commitRefreshedToken>[1]
        ),
    // One line instead of a kind branch: the asymmetry (relay logs out, cloud only leaves the
    // cloud) is now typed as two renewers rather than explained in a comment here.
    onAuthExpired: kind => credentialRenewers[kind].onTerminalExpiry(),
});
