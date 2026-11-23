import { logger } from '@chatic/logger';
import { Coalescer, Throttle, relaySession } from '@chatic/auth';
import { getSessionAuthSnapshot, markSessionInitialized, subscribeSessionSignal } from '@chatic/session';
import { isLinkKnownDown, subscribeOnline } from '@chatic/transport';

import { foregroundPlatform } from './foreground';

const MAX_INIT_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

const RETRY_FLOOR_MS = 5_000;

export interface SessionControllerOptions {
    deviceId: () => string | null | undefined;
}

export interface SessionController {
    initialize(): Promise<void>;
    isReady(): boolean;
    subscribeReady(listener: () => void): () => void;
    startGuestKeepAlive(): () => void;
}

const isAuthenticated = (): boolean => getSessionAuthSnapshot().isAuthenticated;

export const createSessionController = ({ deviceId }: SessionControllerOptions): SessionController => {
    let initialization: Promise<void> | null = null;
    let initCompleted = false;
    const readyListeners = new Set<() => void>();
    const guestLogin = new Coalescer<void>();
    const retryFloor = new Throttle({ intervalMs: RETRY_FLOOR_MS });

    const completeInit = (): void => {
        initCompleted = true;
        for (const listener of [...readyListeners]) listener();
    };

    const runInitialization = (attempt: number, done: () => void): void => {
        logger.debug('WEB_CORE', 'Starting initialization attempt', { data: { retry: attempt } });
        relaySession.initialize().then(
            () => {
                logger.debug('WEB_CORE', 'Initialization completed successfully');
                completeInit();
                done();
            },
            error => {
                logger.error('WEB_CORE', 'Relay session init failed', { error });
                if (attempt < MAX_INIT_RETRIES) {
                    const next = attempt + 1;
                    logger.debug('WEB_CORE', 'Retrying initialization', {
                        data: { retryCount: next, maxRetries: MAX_INIT_RETRIES },
                    });
                    setTimeout(() => runInitialization(next, done), RETRY_DELAY_MS * next);
                    return;
                }
                logger.error('WEB_CORE', 'Relay session init failed after all retries, forcing app render');
                markSessionInitialized();
                completeInit();
                done();
            }
        );
    };

    return {
        initialize() {
            initialization ??= new Promise<void>(resolve => runInitialization(0, resolve));
            return initialization;
        },

        isReady: () => initCompleted && getSessionAuthSnapshot().isInitialized,

        subscribeReady(listener) {
            readyListeners.add(listener);
            const unsubscribeSignal = subscribeSessionSignal(listener);
            return () => {
                readyListeners.delete(listener);
                unsubscribeSignal();
            };
        },

        startGuestKeepAlive() {
            let stopped = false;
            const foreground = foregroundPlatform.ports();

            const attempt = (): void => {
                if (stopped || isAuthenticated()) return;
                const id = deviceId();
                if (!id) return;
                if (isLinkKnownDown()) {
                    logger.debug('AUTH', '[keepAlive] relay session absent but offline — waiting for the link');
                    return;
                }
                logger.debug('AUTH', '[keepAlive] relay session absent, running background guest login');
                void guestLogin.run(() =>
                    relaySession
                        .loginGuestByDevice(id)
                        .then(() => undefined)
                        .catch(error => logger.error('AUTH', '[keepAlive] guest login failed', { error }))
                );
            };

            const retryOnEdge = (): void => {
                if (stopped || isAuthenticated()) return;
                if (isLinkKnownDown() || !retryFloor.tryAcquire()) return;
                attempt();
            };

            let wasAuthenticated = isAuthenticated();
            const unsubscribeSession = subscribeSessionSignal(() => {
                const now = isAuthenticated();
                const lost = wasAuthenticated && !now;
                wasAuthenticated = now;
                if (lost) void Promise.resolve().then(attempt);
            });
            const unsubscribeOnline = subscribeOnline(retryOnEdge);
            const unsubscribeForeground = foreground.subscribe(() => {
                if (foreground.read()) retryOnEdge();
            });

            attempt();

            return () => {
                stopped = true;
                unsubscribeSession();
                unsubscribeOnline();
                unsubscribeForeground();
            };
        },
    };
};
