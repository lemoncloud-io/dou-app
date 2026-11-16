import { logger } from '@chatic/logger';
import { Coalescer, Throttle, relaySession } from '@chatic/auth';
import { getSessionAuthSnapshot, markSessionInitialized, subscribeSessionSignal } from '@chatic/session';
import { isLinkKnownDown, subscribeOnline } from '@chatic/transport';

import { foregroundPlatform } from './foreground';

/** Retries after a failed init, each waiting one more step of this delay (2 s, 4 s, 6 s). */
const MAX_INIT_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

/**
 * Floor between two EDGE-driven guest-login retries. The edges are cheap to fire repeatedly — a user
 * bouncing between apps produces a foreground edge every time — and each attempt is a real login
 * POST, so this is a storm guard. It never delays the first attempt: that runs when the keep-alive
 * starts, not off an edge, and `Throttle` grants its first acquire anyway.
 */
const RETRY_FLOOR_MS = 5_000;

export interface SessionControllerOptions {
    /** The device id a guest logs in with. Read on each attempt, like the connection controller's. */
    deviceId: () => string | null | undefined;
}

/**
 * The relay session's own lifecycle, outside React: bringing it up once at boot, and keeping a
 * session-less visitor signed in as a guest. The connection host starts both and binds the sockets
 * once `isReady()` says the session is there to bind with.
 */
export interface SessionController {
    /**
     * Initialises the relay session, once per controller — a second call returns the first call's
     * promise. A failure is retried three times; after the last, the session is marked initialised
     * anyway, so the app renders signed out rather than not at all.
     */
    initialize(): Promise<void>;
    /** `true` once `initialize` has finished and the session store says it is initialised. */
    isReady(): boolean;
    /** Calls `listener` whenever `isReady()` may have changed. Returns the unsubscribe. */
    subscribeReady(listener: () => void): () => void;
    /**
     * Keeps the relay session present: while there is none, logs in as a guest by device. Returns the
     * stop. This recovers an absent session, not an explicit logout of a signed-in user — a logout
     * that leaves no session is followed by a guest login, which is the point.
     */
    startGuestKeepAlive(): () => void;
}

const isAuthenticated = (): boolean => getSessionAuthSnapshot().isAuthenticated;

export const createSessionController = ({ deviceId }: SessionControllerOptions): SessionController => {
    let initialization: Promise<void> | null = null;
    let initCompleted = false;
    const readyListeners = new Set<() => void>();
    // The keep-alive's one-login-at-a-time slot and its retry floor belong to the controller, not to a
    // start: a stop followed by a start (React StrictMode's double effect, a remounted host) must join
    // the login the first start already sent rather than send a second one.
    const guestLogin = new Coalescer<void>();
    const retryFloor = new Throttle({ intervalMs: RETRY_FLOOR_MS });

    const completeInit = (): void => {
        initCompleted = true;
        for (const listener of [...readyListeners]) listener();
    };

    /** One attempt; a failure schedules the next until the retries run out. Resolves when done either way. */
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
            // The store's half of readiness moves on the session's own signals.
            const unsubscribeSignal = subscribeSessionSignal(listener);
            return () => {
                readyListeners.delete(listener);
                unsubscribeSignal();
            };
        },

        /**
         * **A failed attempt has to be retriable.** Nothing about a failure moves — the session is still
         * absent, the device id is the same — so a first launch with no network used to burn its one
         * attempt and then sit sessionless until the app was restarted: coming back online
         * re-established the sockets, but nothing re-asked for the session they needed. The two edges
         * below are that re-ask — the network coming back, and the app returning to the foreground (a
         * suspended page may have missed the network coming back entirely) — and the offline skip
         * keeps the attempt for a moment when it can succeed (the same `isLinkKnownDown` verdict both
         * credential guards use).
         */
        startGuestKeepAlive() {
            let stopped = false;
            const foreground = foregroundPlatform.ports();

            const attempt = (): void => {
                if (stopped || isAuthenticated()) return;
                const id = deviceId();
                if (!id) return;
                if (isLinkKnownDown()) {
                    // The login would only fail; the online edge brings us back.
                    logger.debug('AUTH', '[keepAlive] relay session absent but offline — waiting for the link');
                    return;
                }
                logger.debug('AUTH', '[keepAlive] relay session absent, running background guest login');
                // One background login at a time: an edge can arrive before the previous attempt settles.
                // A failed attempt frees the slot, so the next trigger retries.
                void guestLogin.run(() =>
                    relaySession
                        .loginGuestByDevice(id)
                        .then(() => undefined)
                        .catch(error => logger.error('AUTH', '[keepAlive] guest login failed', { error }))
                );
            };

            // An edge is only worth a retry while there is nothing to log in for; the floor is consumed
            // only then, so a signed-in app keeps it for the moment it is needed.
            const retryOnEdge = (): void => {
                if (stopped || isAuthenticated()) return;
                if (isLinkKnownDown() || !retryFloor.tryAcquire()) return;
                attempt();
            };

            // A session that goes away — a logout, a revoked relay session — is a new absence to fill.
            // Deferred to a microtask, as the React effect it replaces ran after the store update that
            // caused it, so the logout that emitted the signal finishes its own work first.
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
