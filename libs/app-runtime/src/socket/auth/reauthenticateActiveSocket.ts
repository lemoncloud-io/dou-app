import { logger } from '@chatic/bridges';

import type { ISocketManager, SocketKind } from '../types';
import type { SocketSessionDelegate } from './types';

export interface ReauthenticateActiveSocketArgs {
    manager: ISocketManager;
    delegate: SocketSessionDelegate;
    /** The server kind whose identity changed — used to seed/sign the re-register and target the slot. */
    kind: SocketKind;
    /**
     * The slot's current cache cid. A same-wss cloud switch (§8-4) changes only the cid (url stays),
     * so SocketBinder never reboots and boundCid would stay frozen on the previous cloud — we re-point
     * it here so cache attribution follows the switch. Omitted/undefined leaves boundCid untouched.
     */
    cid?: string | null;
}

/**
 * Re-authenticates the live socket to a NEW identity on the SAME connection — the guest→social
 * (or email) promotion case, where web-core swaps the relay token but the url/deviceId/wssType are
 * unchanged, so SocketBinder does not reboot and the SDK still holds the old identity.
 *
 * A bare `register()` on an already-active controller is a silent token swap (no `auth.update`),
 * so the socket would stay authenticated as the old identity. The SDK's resume path re-runs the
 * handshake only when it goes inactive, so we `logout()` (→ `auth.logout`, revoking the old backend
 * session) and then `register()` the new token — the controller resumes and re-sends `auth.update`
 * on the same connection. (multi-socket-design.md §6-7)
 *
 * Guard (feedback-loop safety): proceed ONLY when the registration token differs from the token the
 * SDK already holds. The SDK's own refresh/switch writeback lands in web-core with the SAME token
 * the controller holds, so this is a no-op there; only a genuine re-login (a new token the SDK was
 * never told about) triggers the logout→register.
 */
export const reauthenticateActiveSocket = async ({
    manager,
    delegate,
    kind,
    cid,
}: ReauthenticateActiveSocketArgs): Promise<void> => {
    // Target the slot for THIS kind, not the global active slot: a relay identity change must re-auth
    // the relay client even while a cloud slot is the active one (getClient() would return cloud).
    const auth = manager.getClient(kind)?.auth;
    if (!auth) {
        return;
    }

    const registration = await delegate.getAuthRegistration(kind);
    if (!registration) {
        return;
    }

    // The SDK already holds this token (its own refresh/switch writeback, or an unrelated re-render) —
    // nothing to do. This is what keeps the SDK-driven writeback from looping back into a re-auth.
    if (registration.token === auth.token) {
        return;
    }

    logger.info('SOCKET', '[reauthenticateActiveSocket] identity changed, re-authenticating');

    // Re-point cache attribution BEFORE the handshake: a same-wss cloud switch keeps the socket but
    // moves clouds, so boundCid must follow now (frames arriving during re-auth attribute correctly).
    if (cid !== undefined) {
        manager.rebindCid(kind, cid);
    }

    // Revoke the PREVIOUS session only on a LIVE (verified) socket, checked PER-KIND (the active
    // snapshot reflects a different slot when this is a background relay re-auth). auth.logout on a
    // disconnected socket 503s and is pointless; register() below runs UNCONDITIONALLY, so even when
    // we skip the revoke the new identity is stored and applied on the next handshake — the
    // token-change edge is never dropped (a transient disconnect coinciding with a guest→social
    // promotion must not leave the socket on the old identity).
    const wasVerified = manager.isKindVerified(kind);
    if (wasVerified) {
        // Fire-and-forget: logout() dispatches the frame synchronously (logout-before-update wire order)
        // and flips the controller inactive so register() resumes immediately; we do NOT await the ack.
        void Promise.resolve(auth.logout()).catch(() => undefined);
    }

    // Force a synchronous verified dip on the ACTIVE slot so useBackgroundSync's isVerified false→true
    // rising edge fires once the SDK re-verifies the new identity. Without this an already-connected
    // controller can swap identity without an auth-state dip, so a same-socket promotion would never
    // re-anchor the promoted user's lists (restores the old markUnverified() behaviour). setAuthenticated
    // only surfaces when `kind` is the active slot, so a background relay re-auth is unaffected.
    if (wasVerified) {
        manager.setAuthenticated(kind, false);
    }

    auth.register({
        token: registration.token,
        authId: registration.authId,
        sign: (token, ctx) => delegate.signAuth(kind, token, ctx?.target),
    });
};
