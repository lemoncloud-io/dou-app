import { logger } from '@chatic/logger';

import { Throttle } from '../utils/throttle';
import { authIdRegistry } from './authIdRegistry';
import { observeSocketVerify, kindOf, slotKeyOf } from '@chatic/transport';
import type { ISocketManager, SocketBindingConfig } from '@chatic/transport';

import type { SocketSessionDelegate } from './types';

export interface BootstrapSocketConnectionArgs {
    manager: ISocketManager;
    config: SocketBindingConfig;
    delegate: SocketSessionDelegate;
}

export type AuthActivationGate = { start(): void; stop(): void };

const DEVICE_SAVED_MESSAGE = 'device.save:ok';

const EXPIRED_RESUME_INITIAL_COOLDOWN_MS = 30_000;
const EXPIRED_RESUME_MAX_COOLDOWN_MS = 5 * 60_000;

export const bootstrapSocketConnection = async ({
    manager,
    config,
    delegate,
}: BootstrapSocketConnectionArgs): Promise<() => void> => {
    const key = slotKeyOf(config.cid);
    const kind = kindOf(key);
    const client = manager.ensure(config);
    const auth = client.auth;
    const unsubscribes: Array<() => void> = [];

    if (!auth) {
        logger.error('SOCKET', '[bootstrapSocketConnection] client has no AuthController — auth disabled');
        await manager.connect(key);
        return () => undefined;
    }

    const gate = auth as unknown as AuthActivationGate;

    unsubscribes.push(observeSocketVerify({ key, client, auth }));

    const resumeThrottle = new Throttle({
        intervalMs: EXPIRED_RESUME_INITIAL_COOLDOWN_MS,
        maxIntervalMs: EXPIRED_RESUME_MAX_COOLDOWN_MS,
    });

    unsubscribes.push(
        auth.onAuthState(state => {
            manager.setAuthenticated(key, state === 'authenticated');
            if (state === 'authenticated') {
                resumeThrottle.reset();
                void delegate.onAuthenticated?.(key);
            }
            if (state === 'expired') {
                void delegate.onAuthExpired?.(key);
            }
        })
    );

    const sign = (token: string, ctx?: { target?: string }) => delegate.signAuth(key, token, ctx?.target);

    /**
     * Commit a refreshed token view, then re-align the controller with what the store now says.
     *
     * The second half is not bookkeeping. The packet's `authId` lives in a private controller field
     * that only `register()` writes — so a rotated `$auth.id` leaves the signature keyed on the NEW id
     * and the packet quoting the OLD one, and the server answers
     * `403 NOT ALLOWED - invalid sign @refreshAccessToken(<old id>)` for every refresh from then on.
     * This is the one place that sees both sides right after they can diverge (`authIdRegistry`).
     *
     * The relay writeback no longer rotates `$auth` on its own — `mergeRefreshedRelayToken` preserves
     * the stored one rather than adopting the view's (see its comment: a site switch returns a child
     * auth that cannot be signed with). So for relay this is now a guard against rotation from
     * elsewhere (a re-login committed through `relaySession.apply`), not the routine case it was
     * written for. Cloud still merges `$auth` shallowly and can rotate here.
     */
    const applyRefreshedToken = async (view: unknown): Promise<void> => {
        try {
            await delegate.commitRefreshedToken(key, view);
        } catch (error) {
            logger.error('SOCKET', '[bootstrapSocketConnection] token writeback failed', {
                error,
                data: { kind, cid: key },
            });
            return;
        }

        try {
            const next = await delegate.getAuthRegistration(key);
            if (next && authIdRegistry.resync(key, auth, next, sign) && client.state !== 'connected') {
                gate.stop();
            }
        } catch (error) {
            logger.warn('SOCKET', '[bootstrapSocketConnection] authId re-sync failed', {
                error,
                data: { kind, cid: key },
            });
        }
    };

    unsubscribes.push(
        auth.onTokenRefresh(view => {
            logger.info('SOCKET', '[bootstrapSocketConnection] token refreshed', { data: { kind, cid: key } });
            void applyRefreshedToken(view);
        })
    );

    const registration = await delegate.getAuthRegistration(key);
    if (registration) {
        auth.register({ token: registration.token, authId: registration.authId, sign });
        authIdRegistry.record(key, registration.authId);
        gate.stop();

        unsubscribes.push(
            client.onMessage(event => {
                if (event.message?.type !== DEVICE_SAVED_MESSAGE) {
                    return;
                }
                if (auth.state === 'expired' && !resumeThrottle.tryAcquire()) {
                    return;
                }
                if (auth.state === 'expired') {
                    logger.warn('SOCKET', '[bootstrapSocketConnection] resuming terminally-expired auth', {
                        data: { kind, cid: key },
                    });
                }
                gate.start();
            })
        );

        unsubscribes.push(
            client.onState(event => {
                if (event.next === 'closed' || event.next === 'closing' || event.next === 'idle') {
                    gate.stop();
                }
            })
        );
    } else {
        logger.warn('SOCKET', '[bootstrapSocketConnection] no auth registration available — skipping register', {
            data: { kind, cid: key },
        });
    }

    await manager.connect(key);

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
