import type { ClientSocketV2 } from '@lemoncloud/chatic-sockets-lib';

import { logger } from '@chatic/bridges';
import type { ISocketManager, SocketBindingConfig, SocketSessionDelegate } from './types';

/** Max wait for the connect-driven device.save ack before bootstrap proceeds anyway. */
const DEVICE_REGISTER_TIMEOUT_MS = 5000;

/** How the connect-driven device.save settled (see waitForDeviceRegistered). */
type DeviceRegisterOutcome = 'ok' | 'error' | 'timeout';

/** auth.update response `state` — the only field that reveals a resolved-but-failed auth. */
const authState = (response: unknown): string | undefined => (response as { state?: string } | null | undefined)?.state;

export class SocketSessionController {
    private delegate: SocketSessionDelegate | null = null;
    private refreshInterval: ReturnType<typeof setInterval> | null = null;
    private reauthPromise: Promise<boolean> | null = null;
    private healPromise: Promise<void> | null = null;
    /** Last config bootstrapped — used to re-establish a socket left disconnected. */
    private lastConfig: SocketBindingConfig | null = null;

    constructor(private readonly manager: ISocketManager) {}

    public setDelegate(delegate: SocketSessionDelegate): void {
        this.delegate = delegate;
    }

    public getDelegate(): SocketSessionDelegate | null {
        return this.delegate;
    }

    public async bootstrap(config: SocketBindingConfig): Promise<void> {
        this.lastConfig = config;
        const client = this.manager.ensure(config);
        this.startPeriodicRefresh();

        try {
            // device.save is no longer issued here: the sync runtime (createDeviceRuntime)
            // saves the device automatically on `connected`. The server rejects auth.update
            // until a device is linked, so we observe the `device.save:ok` ack (subscribed
            // before connect to avoid missing it) and only then run auth.update.
            const registered = this.waitForDeviceRegistered(client);
            await this.manager.connect();
            const outcome = await registered;
            if (outcome === 'error') {
                // The save failed, so auth.update would predictably fail with
                // 'no device linked' — skip that round-trip and go straight to recovery
                // (which re-runs auth.update after a fresh token, by which time the
                // runtime has retried the save).
                await this.handle401Recovery();
                return;
            }
            await this.updateAuth('bootstrap');
        } catch (error) {
            logger.error('SOCKET', '[SocketSessionController] failed during bootstrap sequence', { error });
        }
    }

    /**
     * Resolves once the connection's device.save has been acknowledged. createDeviceRuntime
     * issues device.save on `connected`, and its `:ok` / `:error` response is delivered to
     * every onMessage listener. Resolves with how it settled — an explicit `:error` used to
     * be treated as success and bootstrap would run an auth.update doomed to fail with
     * 'no device linked'. Times out so a missing save cannot wedge bootstrap.
     */
    private waitForDeviceRegistered(
        client: ClientSocketV2,
        timeoutMs = DEVICE_REGISTER_TIMEOUT_MS
    ): Promise<DeviceRegisterOutcome> {
        return new Promise<DeviceRegisterOutcome>(resolve => {
            let settled = false;
            let unsubscribe: (() => void) | null = null;
            let timer: ReturnType<typeof setTimeout> | null = null;

            const finish = (outcome: DeviceRegisterOutcome) => {
                if (settled) return;
                settled = true;
                unsubscribe?.();
                if (timer) clearTimeout(timer);
                resolve(outcome);
            };

            unsubscribe = client.onMessage(({ message }) => {
                if (typeof message?.type !== 'string') return;
                if (message.type === 'device.save:ok') finish('ok');
                else if (message.type === 'device.save:error') {
                    logger.warn('SOCKET', '[SocketSessionController] device.save failed', {
                        error: (message as { error?: string }).error,
                    });
                    finish('error');
                }
            });

            timer = setTimeout(() => {
                logger.warn('SOCKET', '[SocketSessionController] device.save ack not observed before timeout');
                finish('timeout');
            }, timeoutMs);
        });
    }

    public async updateAuth(reason: string): Promise<boolean> {
        if (!this.delegate) {
            logger.warn('SOCKET', '[SocketSessionController] skipped auth update because delegate is not set');
            return false;
        }

        const token = await this.delegate.getSocketToken();
        if (!token) {
            logger.warn('SOCKET', '[SocketSessionController] skipped auth:update due to missing token', { reason });
            return false;
        }

        const client = this.manager.getClient();
        if (!client || !this.manager.getSnapshot().isConnected) {
            logger.warn('SOCKET', '[SocketSessionController] skipped auth:update because socket is not connected', {
                reason,
            });
            return false;
        }

        logger.info('SOCKET', '[SocketSessionController] sending auth:update', { reason });
        try {
            await this.requestAuthUpdate(client, token);
            this.manager.markVerified();
            return true;
        } catch (error) {
            logger.error('SOCKET', '[SocketSessionController] auth.update failed, triggering recovery', {
                error,
                reason,
            });
            return this.handle401Recovery();
        }
    }

    /**
     * auth.update that treats a resolved-but-failed payload as an error. The server
     * responds `:ok` with `state: 'failed'` when it rejects the token, and trusting
     * the resolve alone would mark an unauthenticated socket verified. A missing
     * `state` (older server) keeps the legacy resolved-means-verified behaviour.
     */
    private async requestAuthUpdate(client: ClientSocketV2, token: string): Promise<void> {
        const response = await client.request('auth.update', { token });
        const state = authState(response);
        if (state != null && state !== 'authenticated') {
            throw new Error(`auth.update rejected the token (state: ${state})`);
        }
    }

    public async handle401Recovery(): Promise<boolean> {
        if (!this.delegate) {
            logger.warn('SOCKET', '[SocketSessionController] skipped recovery because delegate is not set');
            return false;
        }

        if (this.reauthPromise) {
            return this.reauthPromise;
        }

        this.reauthPromise = (async () => {
            logger.info('SOCKET', '[SocketSessionController] Starting 401 recovery sequence');
            this.manager.markUnverified();

            try {
                const token = await this.delegate?.refreshSocketToken('socket-401');
                if (!token) {
                    throw new Error('Failed to obtain new token during recovery');
                }

                const client = this.manager.getClient();
                if (!client) {
                    throw new Error('Socket client is not available');
                }

                await this.requestAuthUpdate(client, token);
                this.manager.markVerified();
                logger.info('SOCKET', '[SocketSessionController] 401 recovery authentication successful');
                return true;
            } catch (error) {
                logger.error('SOCKET', '[SocketSessionController] 401 recovery sequence failed', { error });
                if (this.delegate?.onRefreshFailed) {
                    try {
                        await this.delegate.onRefreshFailed(error);
                    } catch (delegateErr) {
                        logger.error('SOCKET', '[SocketSessionController] delegate.onRefreshFailed threw error', {
                            delegateErr,
                        });
                    }
                }
                return false;
            } finally {
                this.reauthPromise = null;
            }
        })();

        return this.reauthPromise;
    }

    public destroy(): void {
        this.stopPeriodicRefresh();
        this.reauthPromise = null;
    }

    /**
     * Re-establishes a socket left disconnected. A rapid sequence of binding changes (the invite
     * flow's loginGuest → switchCloud → switchSite, or quick cloud switches) can race the bootstrap
     * connect so the final client never finishes connecting — and nothing recovers it, since the
     * periodic refresh used to merely skip auth:update while disconnected. The result is a session
     * stuck with a dead socket: every `*.send`/`request` throws `503 SOCKET NOT CONNECTED` and
     * messages are silently lost until a manual cloud re-switch. Reconnecting the current client
     * (idempotent — a no-op when already open) and re-authing self-heals that state.
     */
    public async recoverConnection(reason: string): Promise<void> {
        if (this.healPromise) return this.healPromise;
        if (!this.lastConfig) return;
        this.healPromise = (async () => {
            try {
                logger.info('SOCKET', '[SocketSessionController] socket disconnected, reconnecting', { reason });
                this.manager.ensure(this.lastConfig as SocketBindingConfig);
                await this.manager.connect();
                if (this.manager.getSnapshot().isConnected) {
                    await this.updateAuth(reason);
                }
            } catch (error) {
                logger.warn('SOCKET', '[SocketSessionController] reconnect heal failed', { error, reason });
            } finally {
                this.healPromise = null;
            }
        })();
        return this.healPromise;
    }

    private startPeriodicRefresh() {
        this.stopPeriodicRefresh();
        this.refreshInterval = setInterval(() => {
            const state = this.manager.getSnapshot();
            // 소켓이 연결되어 있을 때만 업데이트를 수행하고, 세션 유무는 updateAuth 내부에서 토큰 획득 여부로 판단합니다.
            if (state.isConnected) {
                void this.updateAuth('periodic-refresh');
            } else {
                // Self-heal a socket left disconnected (e.g. a bootstrap race on invite entry) instead
                // of skipping forever — otherwise the session is wedged with a dead socket.
                void this.recoverConnection('periodic-heal');
            }
        }, 60000); // 1 minute
    }

    private stopPeriodicRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
    }
}
