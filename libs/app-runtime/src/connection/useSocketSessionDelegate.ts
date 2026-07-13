import { useMemo } from 'react';

import { logger } from '@chatic/bridges';
import {
    commitServerRefreshedToken,
    getServerAuthRegistration,
    logoutCloudSession,
    signServerAuth,
} from '@chatic/web-core';

import type { SocketSessionDelegate } from '../socket';

/**
 * Builds the socket session delegate that bridges the SDK AuthController (wired by
 * bootstrapSocketConnection) to web-core's PER-SERVER auth helpers. Every method is keyed by the
 * socket's kind, so the relay and cloud sockets each seed/sign/write-back against their own server.
 * This lives inside app-runtime — which already depends on web-core — so apps no longer inject a
 * delegate.
 *
 * The returned delegate is stable (its members are all module-level web-core functions), so the
 * SocketBinder effects do not re-bootstrap on re-render.
 */
export const useSocketSessionDelegate = (): SocketSessionDelegate => {
    return useMemo<SocketSessionDelegate>(
        () => ({
            getAuthRegistration: kind => getServerAuthRegistration(kind),
            signAuth: (kind, _token, target) => signServerAuth(kind, target),
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
                // Relay terminal `expired`: POLICY = NO auto-logout — relay logout is manual-only. The
                // socket is dead (isVerified→false) but the relay token stays in the store, so recovery
                // is a manual logout or an app reload. With the 5min refresh fallback + reconnect
                // re-auth (SocketManager AUTH_OPTIONS), terminal relay expiry is rare.
                logger.warn('SOCKET', '[delegate] relay auth expired — no auto-logout (manual logout only)');
            },
        }),
        []
    );
};
