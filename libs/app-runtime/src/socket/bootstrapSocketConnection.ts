import { logger } from '@chatic/bridges';

import type { ISocketManager, SocketBindingConfig, SocketKind, SocketSessionDelegate } from './types';

export interface BootstrapSocketConnectionArgs {
    manager: ISocketManager;
    config: SocketBindingConfig;
    delegate: SocketSessionDelegate;
}

/**
 * Boots a socket for `config` and wires it to the SDK AuthController. Pure function (no retained
 * state): the SocketBinder calls it and holds the returned cleanup, which detaches the SDK
 * subscriptions on teardown.
 *
 * Ordering is load-bearing (see multi-socket-design.md §6-1): the SDK marks the controller active
 * at client creation, so `register()` on an already-active controller only stores the token — the
 * actual `auth.update` is sent by the SDK's own `onState('connected')` handler. Therefore we must
 * register BEFORE connect; connecting first lets the `connected` event pass with an empty token and
 * auth never fires on this connection.
 */
export const bootstrapSocketConnection = async ({
    manager,
    config,
    delegate,
}: BootstrapSocketConnectionArgs): Promise<() => void> => {
    // The slot kind is carried on the config (relay vs cloud wss). Each slot is bootstrapped
    // independently, so ensure/connect/setAuthenticated all address this kind.
    const kind: SocketKind = config.wssType ?? 'relay';
    const client = manager.ensure(config, kind);
    const auth = client.auth;
    const unsubscribes: Array<() => void> = [];

    if (!auth) {
        // Defensive: SocketManager always attaches the AuthController (auth option is set), so this
        // only happens if that wiring regresses. Connect anyway so transport-only flows still work.
        logger.error('SOCKET', '[bootstrapSocketConnection] client has no AuthController — auth disabled');
        await manager.connect(kind);
        return () => undefined;
    }

    // Mirror the SDK auth state into the manager's isVerified (per slot), run teardown on terminal expiry.
    unsubscribes.push(
        auth.onAuthState(state => {
            manager.setAuthenticated(kind, state === 'authenticated');
            if (state === 'expired') {
                void delegate.onAuthExpired?.(kind);
            }
        })
    );

    // Every refresh/switch success carries the full token view — write it back to web-core so the
    // HTTP/AWS signing layers stay fresh (SDK is the socket-token SSoT; web-core is the read model).
    // Routed by THIS socket's kind so a refresh during a switch/teardown lands in the right store (§6-6).
    unsubscribes.push(
        auth.onTokenRefresh(view => {
            void delegate.commitRefreshedToken(kind, view);
        })
    );

    // register BEFORE connect (see the ordering note above). A null registration (token not ready)
    // defers auth until the next bootstrap; the identityToken binding gate normally prevents that.
    const registration = await delegate.getAuthRegistration(kind);
    if (registration) {
        auth.register({
            token: registration.token,
            authId: registration.authId,
            sign: (token, ctx) => delegate.signAuth(kind, token, ctx?.target),
        });
    } else {
        logger.warn('SOCKET', '[bootstrapSocketConnection] no auth registration available — skipping register');
    }

    await manager.connect(kind);

    return () => {
        for (const unsubscribe of unsubscribes) {
            try {
                unsubscribe();
            } catch (error) {
                logger.warn('SOCKET', '[bootstrapSocketConnection] failed to detach auth subscription', { error });
            }
        }
    };
};
