import { logger } from '@chatic/bridges';

import type { ISocketManager, SocketKind, SocketSessionDelegate } from './types';

export interface ReauthenticateActiveSocketArgs {
    manager: ISocketManager;
    delegate: SocketSessionDelegate;
    /** The active server kind whose identity changed — used to seed/sign the re-register. */
    kind: SocketKind;
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
}: ReauthenticateActiveSocketArgs): Promise<void> => {
    const auth = manager.getClient()?.auth;
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

    logger.info('SOCKET', '[reauthenticateActiveSocket] identity changed on the live socket, re-authenticating');
    // Fire-and-forget the revoke of the previous session: logout() dispatches the auth.logout frame
    // synchronously (preserving logout-before-update wire order) and flips the controller inactive,
    // so register() can resume immediately. We do NOT await the server ack — on a wedged socket it
    // could hang to the 30s request timeout and needlessly delay the promotion re-auth. logout() is
    // best-effort and does not reject; the promise is guarded regardless.
    void Promise.resolve(auth.logout()).catch(() => undefined);
    auth.register({
        token: registration.token,
        authId: registration.authId,
        sign: (token, ctx) => delegate.signAuth(kind, token, ctx?.target),
    });
};
