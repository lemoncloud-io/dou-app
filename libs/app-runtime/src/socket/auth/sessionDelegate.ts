// The session half of the bridge — seed · sign · writeback (ADR-0076 Decision 5). Runtime-internal and
// off the session barrel (Decision 6).
import { sessionAuthAdapter } from '../../session/auth/sessionAuthAdapter';
import { alignSessionSite, alignStoredSessionSite } from './alignSessionSite';
import { createReauthDelegate } from './reauthDelegate';
// Terminal-expiry policy belongs to the per-server renewer (ADR-0076 Decision 3), which takes the
// store-only teardown path on purpose: `onAuthExpired` runs on the socket that just died, so
// notifying it again (what the app-facing `logoutSession`/`logoutCloudSession` do) is pointless.
import { credentialRenewers } from './renewers';

import type { SocketSessionDelegate } from './types';

/**
 * Builds the socket session delegate that bridges the SDK AuthController (wired by
 * bootstrapSocketConnection) to the session's PER-SERVER auth helpers. Every method is keyed by the
 * socket's slot, so each slot seeds/signs/writes back against the cloud it serves.
 *
 * Module-level (not a hook) so non-React callers — recoverUnverifiedSockets — can build the same
 * delegate; the React side wraps it in useSocketSessionDelegate. Every member forwards to a
 * module-level singleton, so instances are interchangeable and carry no state.
 *
 * The re-auth path does NOT come here: it takes the narrow `createReauthDelegate` directly, which
 * is what keeps `renewCloudSession` out of this module's renewer edge.
 */
export const createSocketSessionDelegate = (): SocketSessionDelegate => ({
    // seed + sign live in `reauthDelegate.ts` — the re-auth path needs those two without the
    // renewer edge below, and this is the whole delegate built back up from that half.
    ...createReauthDelegate(),
    // Routed by the socket's own slot (§6-6). The SDK AuthTokenView is not exported from the
    // package root; the session boundary casts it to its own UserTokenView here.
    // Every token the server hands this slot names the place its session is on, so this is where a
    // session that left the selected place is first visible — see `alignSessionSite`.
    commitRefreshedToken: async (slot, view) => {
        await sessionAuthAdapter.commitRefreshedToken(
            slot,
            view as Parameters<typeof sessionAuthAdapter.commitRefreshedToken>[1]
        );
        void alignSessionSite(slot, (view as { $site?: { id?: string } } | null)?.$site?.id);
    },
    // One line instead of a kind branch: the asymmetry (relay logs out, a cloud only loses that
    // cloud) is typed as renewers rather than explained in a comment here.
    onAuthExpired: slot => credentialRenewers.forSlot(slot).onTerminalExpiry(),
    // A connect registers with the STORED token and writes nothing back, so a session that left the
    // selected place before a reload would otherwise stay there until the next refresh.
    onAuthenticated: slot => alignStoredSessionSite(slot),
});
