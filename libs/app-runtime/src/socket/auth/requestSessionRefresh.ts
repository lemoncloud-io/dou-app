import { logger } from '@chatic/bridges';
import { refreshActiveCloudSession, refreshRelaySession } from '@chatic/web-core';

import { getSocketManager } from '../runtime';
import type { ISocketManager, SocketKind } from '../types';

/** Ceiling for the socket-owned refresh to land its writeback before we report failure. */
const SOCKET_REFRESH_ACK_TIMEOUT_MS = 10_000;

/**
 * `runRefresh` is public on the SDK's `AuthControllerImpl` but omitted from the exported
 * `AuthController` interface — the same interface-widening the bootstrap gate uses for
 * `start`/`stop` (see bootstrapSocketConnection). It fires one epoch-serialized `auth.refresh`
 * (sign → gateway.refresh → emitToken on success), which is exactly "refresh now". Fragile across
 * SDK upgrades — replace with a public `refreshNow()` when the SDK grows one.
 */
type AuthRefreshRunner = { runRefresh(): Promise<void> };

export interface RequestSessionRefreshDeps {
    manager?: ISocketManager;
}

/**
 * THE single entry point for "this session's HTTP credentials look stale — make them fresh"
 * (2026-08 session audit §7 Phase 2-3). Callers (e.g. admin-v2's session guard) must not fire
 * their own refresh — that is how the second refresh engine and its store divergence happened.
 *
 * Route order:
 *  1. Socket path — a connected, authenticated AuthController owns refresh: force one now and
 *     resolve once its `onTokenRefresh` fires (the same emission bootstrapSocketConnection routes
 *     into `commitServerRefreshedToken`, which re-mints the HTTP/AWS credentials). Resolution
 *     signals the refresh SUCCEEDED; the writeback commit runs concurrently and lands within the
 *     same tick chain.
 *  2. HTTP fallback — no live socket to delegate to (slot unbound, disconnected, or mid-recovery):
 *     run the service-level refresh (single-flight, consistent double-write). If a socket is
 *     mid-handshake, the resulting store update converges through SocketReauthBinder's
 *     token-change re-auth, so the fallback cannot poison the socket's identity.
 *
 * Returns true when a refresh (either path) succeeded, false otherwise. Never throws.
 */
export const requestSessionRefresh = async (
    kind: SocketKind,
    deps: RequestSessionRefreshDeps = {}
): Promise<boolean> => {
    const manager = deps.manager ?? getSocketManager();
    const client = manager.getClient(kind);
    const auth = client?.auth;

    if (client && auth && client.state === 'connected' && auth.state === 'authenticated') {
        return await new Promise<boolean>(resolve => {
            let settled = false;
            const finish = (ok: boolean) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                offToken();
                offState();
                resolve(ok);
            };
            const offToken = auth.onTokenRefresh(() => finish(true));
            // `failed` here means THIS refresh was rejected (we only enter from `authenticated`);
            // the SDK's own backoff keeps retrying behind the scenes, but the caller's answer is no.
            const offState = auth.onAuthState(state => {
                if (state === 'failed' || state === 'expired') finish(false);
            });
            const timer = setTimeout(() => finish(false), SOCKET_REFRESH_ACK_TIMEOUT_MS);
            void (auth as unknown as AuthRefreshRunner).runRefresh();
        });
    }

    try {
        if (kind === 'relay') {
            await refreshRelaySession();
        } else {
            await refreshActiveCloudSession();
        }
        return true;
    } catch (error) {
        logger.warn('SOCKET', '[requestSessionRefresh] HTTP fallback refresh failed', { error, data: { kind } });
        return false;
    }
};
