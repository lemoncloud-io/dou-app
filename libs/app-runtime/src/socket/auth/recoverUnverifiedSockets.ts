import { logger } from '@chatic/bridges';

import { Coalescer } from '../../utils/coalescer';
import { authIdRegistry } from './authIdRegistry';
import { getAuthStatus, needsSocketKick } from './authStatus';
import { getSocketManager } from '../runtime';
import { createSocketSessionDelegate } from './sessionDelegate';
import type { AuthActivationGate } from './bootstrapSocketConnection';
import type { ISocketManager } from '../types';
import { kindOf } from '../utils/slotKey';
import type { SocketSessionDelegate } from './types';

export interface RecoverUnverifiedSocketsDeps {
    manager?: ISocketManager;
    delegate?: SocketSessionDelegate;
}

/** Concurrent kicks collapse onto the in-flight run (ADR-0076 Decision 4 — was a bespoke `let inFlight`). */
const coalescer = new Coalescer<void>();

/**
 * Foreground/wake kick for wedged sockets (2026-08 session audit §7 Phase 1; generalizes the
 * desktop-web `useSocketWakeRecovery` pattern into the runtime). After a suspension the transport
 * can be a half-open zombie — recovery otherwise waits for the keep-alive loop to miss two pongs
 * (~40-80s) before the reconnect controller re-establishes and the SDK re-authenticates.
 *
 * Per bound slot that is NOT verified:
 *  1. Force-close the transport. `connect()` below re-arms the SDK reconnect controller, so a
 *     failed attempt still keeps auto-reconnect running.
 *  2. If the controller is terminally `expired`, re-seed it via `register()` (idempotent; resets
 *     the failure budget and moves the state off `expired`, so the bootstrap gate's expired-resume
 *     throttle does not apply to this user-visible recovery) — then immediately re-close the
 *     activation gate so the next `connected` cannot auto-send auth.update BEFORE that
 *     connection's device.save:ok (the bootstrap gate owns the ordering).
 *  3. Reconnect. device.save:ok → gate.start() → auth.update, in order.
 *
 * A slot whose flags are stale-verified (zombie that still reports verified) is deliberately left
 * to the keep-alive path — kicking a healthy-looking socket on every foreground would churn warm
 * reconnects. Concurrent calls coalesce onto the in-flight run.
 */
export const recoverUnverifiedSockets = (deps: RecoverUnverifiedSocketsDeps = {}): Promise<void> =>
    coalescer.run(() => doRecover(deps));

const doRecover = async ({ manager, delegate }: RecoverUnverifiedSocketsDeps): Promise<void> => {
    const socketManager = manager ?? getSocketManager();
    const sessionDelegate = delegate ?? createSocketSessionDelegate();

    // Every bound slot, checked independently: relay can be wedged while a cloud is the active one.
    for (const key of socketManager.getSlotKeys()) {
        const kind = kindOf(key);
        const client = socketManager.getClient(key);
        if (!client) {
            continue;
        }

        // One judgement instead of two reads (ADR-0076 Decision 1): `needsSocketKick` is true for
        // `handshaking` and `expired` — exactly the "bound but not verified on this connection"
        // set this used to express as `!isSlotVerified(key)`. A healthy-looking slot is skipped
        // deliberately; kicking it on every foreground would churn warm reconnects.
        const status = getAuthStatus(key, { manager: socketManager });
        if (!needsSocketKick(status)) {
            continue;
        }

        const auth = client.auth;
        const wasExpired = status === 'expired';
        logger.info('SOCKET', '[recoverUnverifiedSockets] kicking unverified socket', {
            data: { kind, cid: key, state: client.state, status, wasExpired },
        });

        // Close first so the re-seed below happens on a disconnected controller (register on a
        // half-open socket would fire auth.update into the void and burn a failure).
        await client.disconnect(1000, 'wake-recovery').catch(() => undefined);

        if (wasExpired && auth) {
            const registration = await sessionDelegate.getAuthRegistration(kind);
            if (registration) {
                auth.register({
                    token: registration.token,
                    authId: registration.authId,
                    sign: (token, ctx) => sessionDelegate.signAuth(kind, token, ctx?.target),
                });
                // Mirror the seeded authId — every register() site must, or the drift check goes blind.
                authIdRegistry.record(key, registration.authId);
                // register() re-activated the controller; close the gate so the reconnect keeps
                // the device.save:ok → auth.update order (same rationale as reauthenticateActiveSocket).
                (auth as unknown as AuthActivationGate).stop();
            }
        }

        await client.connect().catch(error => {
            // connect() arms the SDK reconnect controller even on failure, so recovery continues
            // in the background; this kick just loses its head start.
            logger.warn('SOCKET', '[recoverUnverifiedSockets] reconnect kick failed', {
                error,
                data: { kind, cid: key },
            });
        });
    }
};
