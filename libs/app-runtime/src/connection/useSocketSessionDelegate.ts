import { useMemo } from 'react';

import {
    commitSocketRefreshedToken,
    getActiveServerAuthRegistration,
    getActiveServerContext,
    logoutCloudSession,
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
            // The SDK AuthTokenView is not exported from the package root; web-core casts it to its
            // own UserTokenView at this boundary.
            commitRefreshedToken: view =>
                commitSocketRefreshedToken(view as Parameters<typeof commitSocketRefreshedToken>[0]),
            onAuthExpired: () => {
                // relay socket expiry must NOT trigger a full logout — relay session validity is
                // owned by web-core's useTokenRefresh. Only tear down the cloud session so relay
                // stays the baseline (multi-socket-design.md §6-10, implementation.md §4-6).
                if (getActiveServerContext().kind === 'cloud') {
                    logoutCloudSession();
                }
            },
        }),
        []
    );
};
