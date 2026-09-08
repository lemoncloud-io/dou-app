import { sessionAuthAdapter } from '../../session/auth/sessionAuthAdapter';

import type { ReauthDelegate } from './types';

/**
 * The seed-and-sign half of the socket session delegate: a registration to register with, and the
 * signature that registration is proven by. Both are `sessionAuthAdapter` pass-throughs, keyed by
 * the socket's own kind (§6-6).
 *
 * **Why this is a file of its own.** `sessionDelegate.ts` carries two more members, and one of them
 * — `onAuthExpired` — maps a terminal expiry to that kind's renewer (ADR-0076 결정 3). So importing
 * the full delegate drags in `renewers` → `renewCloudSession`, and `renewCloudSession` is itself a
 * caller of `reauthenticateActiveSocket`: the re-auth path importing the full delegate closed a
 * cycle (`sessionDelegate` → `renewers` → `renewCloudSession` → `sessionDelegate`). Splitting off
 * the half the re-auth path actually uses is what keeps that ring open — the edges now run
 * `renewCloudSession` → here → `session/auth`, and nothing comes back.
 *
 * Instances are interchangeable and carry no state (every member forwards to a module-level
 * singleton), so callers build one per call rather than sharing.
 */
export const createReauthDelegate = (): ReauthDelegate => ({
    getAuthRegistration: kind => sessionAuthAdapter.getAuthRegistration(kind),
    signAuth: (kind, _token, target) => sessionAuthAdapter.signAuth(kind, target),
});
