import { useMemo } from 'react';

import {
    commitServerRefreshedToken,
    getActiveServerAuthRegistration,
    logoutCloudSession,
    logoutRelaySession,
    signActiveServerAuth,
} from '@chatic/web-core';

import type { SocketSessionDelegate } from '../socket';

/**
 * Builds the socket session delegate that bridges the SDK AuthController (wired by
 * bootstrapSocketConnection) to web-core's active-server-aware auth helpers. This lives inside
 * app-runtime — which already depends on web-core — so apps no longer inject a delegate.
 *
 * The returned delegate is stable (its members are all module-level web-core functions), so the
 * SocketBinder effect does not re-bootstrap on re-render.
 */
export const useSocketSessionDelegate = (): SocketSessionDelegate => {
    return useMemo<SocketSessionDelegate>(
        () => ({
            getAuthRegistration: () => getActiveServerAuthRegistration(),
            signAuth: (_token, target) => signActiveServerAuth(target),
            // Routed by the socket's own kind (§6-6). The SDK AuthTokenView is not exported from the
            // package root; web-core casts it to its own UserTokenView at this boundary.
            commitRefreshedToken: (kind, view) =>
                commitServerRefreshedToken(kind, view as Parameters<typeof commitServerRefreshedToken>[1]),
            onAuthExpired: kind => {
                if (kind === 'cloud') {
                    // cloud expiry: tear down only the cloud session; relay stays the baseline.
                    logoutCloudSession();
                    return;
                }
                // relay terminal expiry: with the SDK owning refresh, no periodic-refresh loop or
                // request self-heal recovers a dead relay session anymore, so escalate to a full
                // relay logout (clears stores → keepAlive re-login + /auth/login redirect). §6-10
                // notes a lighter reboot/re-register is a future refinement.
                void logoutRelaySession();
            },
        }),
        []
    );
};
