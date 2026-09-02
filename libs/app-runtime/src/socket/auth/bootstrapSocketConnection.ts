import { logger } from '@chatic/bridges';

import type { ISocketManager, SocketBindingConfig, SocketKind } from '../types';
import type { SocketSessionDelegate } from './types';

export interface BootstrapSocketConnectionArgs {
    manager: ISocketManager;
    /** The slot this boot addresses. Passed explicitly by the binder — never derived from the
     * config, so a config missing `wssType` can no longer silently overwrite the relay slot. */
    kind: SocketKind;
    config: SocketBindingConfig;
    delegate: SocketSessionDelegate;
}

/**
 * `start()`/`stop()` toggle the SDK AuthController's internal `active` flag WITHOUT a server notify
 * (unlike `logout()`, which revokes the backend session). They are declared public on the SDK's
 * `AuthControllerImpl` but omitted from the exported `AuthController` interface, so we widen the type
 * here to reach them. This is the only app-side lever that can both suppress the controller's own
 * `connected`→`auth.update` auto-send AND fire it later on the same connection (see the ordering note
 * on `bootstrapSocketConnection`). Relying on non-interface methods is fragile across SDK upgrades —
 * revisit if the SDK ever exposes a device-gated auth handshake of its own.
 */
export type AuthActivationGate = { start(): void; stop(): void };

/** Socket message the backend emits once a device row is persisted for this connection. */
const DEVICE_SAVED_MESSAGE = 'device.save:ok';

/**
 * Cooldown between resume attempts on a TERMINALLY-EXPIRED controller (2026-08 session audit §5-1).
 *
 * `gate.start()` on `device.save:ok` used to be unconditional, which resurrected a controller the
 * SDK had parked as `expired` (its failures>maxFailures safety) on EVERY reconnect. Combined with
 * the unlimited reconnect controller, a server that drops failed-auth sockets produced an unbounded
 * auth.update/auth.refresh stream ("countless refresh requests"). A hard no-op is wrong the other
 * way: `expired` is also reachable through transient burns (e.g. request timeouts on a zombie
 * socket right after wake), where the unconditional resume WAS the auto-recovery. So resume stays,
 * but throttled — first resume immediate, then exponential cooldown, reset on `authenticated`.
 * A user-visible recovery (wake kick) bypasses the throttle by re-registering, which moves the
 * controller off `expired` before the gate check runs (see recoverUnverifiedSockets).
 */
const EXPIRED_RESUME_INITIAL_COOLDOWN_MS = 30_000;
const EXPIRED_RESUME_MAX_COOLDOWN_MS = 5 * 60_000;

/**
 * Boots a socket for `config` and wires it to the SDK AuthController. Pure function (no retained
 * state): the SocketBinder calls it and holds the returned cleanup, which detaches the SDK
 * subscriptions on teardown.
 *
 * Ordering is load-bearing. The backend cannot process `auth.update` until the device is registered
 * for the connection (`device.save:ok`), and the SDK sends BOTH `device.save` and `auth.update` on
 * the same `connected` event with `auth.update` dispatched first — so the SDK's default handshake
 * races ahead of device registration and auth fails. A failed initial `auth.update` is not retried
 * as `auth.update` (the SDK backoff only re-runs `auth.refresh`, which cannot establish the first
 * session), so the socket ends up terminally `expired`.
 *
 * We therefore gate the auth handshake on `device.save:ok` instead of letting the SDK fire it on
 * connect:
 *   1. `register()` seeds the token/sign but does NOT fire (the controller only auto-sends on the
 *      NEXT `connected`), then `stop()` deactivates the controller so its `connected` handler no-ops.
 *   2. On `device.save:ok`, `start()` re-activates the controller which, being connected with a
 *      token, immediately sends `auth.update` — now after device registration.
 *   3. On every disconnect we `stop()` again, re-closing the gate so reconnects hold the same order.
 */
export const bootstrapSocketConnection = async ({
    manager,
    kind,
    config,
    delegate,
}: BootstrapSocketConnectionArgs): Promise<() => void> => {
    // Each slot is bootstrapped independently; ensure/connect/setAuthenticated all address `kind`.
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

    const gate = auth as unknown as AuthActivationGate;

    // Expired-resume throttle state (see the cooldown constants above). Per bootstrap instance:
    // a reboot is a fresh identity attempt, so it deliberately starts with a clean budget.
    let resumeHoldUntil = 0;
    let resumeCooldownMs = EXPIRED_RESUME_INITIAL_COOLDOWN_MS;

    // Mirror the SDK auth state into the manager's isVerified (per slot), run teardown on terminal expiry.
    unsubscribes.push(
        auth.onAuthState(state => {
            manager.setAuthenticated(kind, state === 'authenticated');
            if (state === 'authenticated') {
                // Healthy again — the next terminal expiry gets a fresh resume budget.
                resumeHoldUntil = 0;
                resumeCooldownMs = EXPIRED_RESUME_INITIAL_COOLDOWN_MS;
            }
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
            // ADR-0070 기준선 계측 ②: refresh 발화 횟수. 이제 refresh는 이 경로 하나뿐이라 이 줄이
            // 유일한 계수원이다 — 예전에는 HTTP 경로가 네트워크 로그에 따로 찍혔고 소켓만
            // NETWORK logs, and signature failures as `... failed (403)`. Logging the socket half here
            // 보이지 않았다. 3단계 전후 비교는 이 한 줄로 센다.
            logger.info('SOCKET', '[bootstrapSocketConnection] token refreshed', { data: { kind } });
            // The writeback is what actually re-mints the HTTP/AWS signing material, and it is the
            // only step that can fail AFTER `requestRelaySessionRefresh` has already reported success
            // (this listener is what resolves it). Without this catch a rejected commit was an
            // unhandled rejection: the caller believed the credentials were fresh while every
            // signed request kept 403-ing. Never rethrow — one slot's failure must not break the
            // others' listeners.
            void Promise.resolve(delegate.commitRefreshedToken(kind, view)).catch(error => {
                logger.error('SOCKET', '[bootstrapSocketConnection] token writeback failed', {
                    error,
                    data: { kind },
                });
            });
        })
    );

    // Seed the token/sign then close the gate (see the ordering note above). A null registration
    // (token not ready) defers auth until the next bootstrap; the identityToken binding gate normally
    // prevents that. register() stores without firing (the controller is active from creation, so the
    // `!active` fast-path that would auto-send is skipped and we are not connected yet anyway); stop()
    // then deactivates so the imminent `connected` event does NOT auto-send `auth.update`.
    const registration = await delegate.getAuthRegistration(kind);
    if (registration) {
        auth.register({
            token: registration.token,
            authId: registration.authId,
            sign: (token, ctx) => delegate.signAuth(kind, token, ctx?.target),
        });
        gate.stop();

        // Open the gate once the device is registered for this connection: re-activating a connected
        // controller with a seeded token sends `auth.update` immediately — now after `device.save:ok`.
        // NOTE: `device.save:ok` is the REPLY to the SDK's `device.save` request, so it settles the
        // pending request and is NOT routed to `onType` (see create-client-socket-v2 handleRawMessage:
        // `if (!handled) router.route(...)`). `onMessage` fires for every message, reply included, so
        // we filter it here — matching the legacy useWebSocketV2 device-registered hook.
        unsubscribes.push(
            client.onMessage(event => {
                if (event.message?.type !== DEVICE_SAVED_MESSAGE) {
                    return;
                }
                // Terminal-expired resume is throttled (constants above): each start() on an
                // expired controller costs exactly one auth.update (failures are NOT reset, so a
                // rejection re-expires immediately), and reconnect-churn environments deliver a
                // device.save:ok per connection. Success resets the budget via onAuthState.
                if (auth.state === 'expired') {
                    const now = Date.now();
                    if (now < resumeHoldUntil) {
                        return;
                    }
                    resumeHoldUntil = now + resumeCooldownMs;
                    resumeCooldownMs = Math.min(resumeCooldownMs * 2, EXPIRED_RESUME_MAX_COOLDOWN_MS);
                    logger.warn('SOCKET', '[bootstrapSocketConnection] resuming terminally-expired auth', {
                        data: { kind, nextCooldownMs: resumeCooldownMs },
                    });
                }
                gate.start();
            })
        );

        // Re-close the gate on every disconnect so a reconnect re-runs device.save → auth.update in
        // order (the SDK re-sends both on each `connected`, and device.save fires anew per connection).
        unsubscribes.push(
            client.onState(event => {
                if (event.next === 'closed' || event.next === 'closing' || event.next === 'idle') {
                    gate.stop();
                }
            })
        );
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
