import type { ClientSocketV2 } from '@lemoncloud/chatic-sockets-lib';

import { logger } from '@chatic/bridges';
import type { ISocketManager, SocketBindingConfig, SocketSessionDelegate } from './types';

/** Max wait for the connect-driven device.save ack before bootstrap proceeds anyway. */
const DEVICE_REGISTER_TIMEOUT_MS = 5000;

export class SocketSessionController {
    private delegate: SocketSessionDelegate | null = null;
    private refreshInterval: ReturnType<typeof setInterval> | null = null;
    private reauthPromise: Promise<boolean> | null = null;

    constructor(private readonly manager: ISocketManager) {}

    public setDelegate(delegate: SocketSessionDelegate): void {
        this.delegate = delegate;
    }

    public getDelegate(): SocketSessionDelegate | null {
        return this.delegate;
    }

    public async bootstrap(config: SocketBindingConfig): Promise<void> {
        const client = this.manager.ensure(config);
        this.startPeriodicRefresh();

        try {
            // device.save is no longer issued here: the sync runtime (createDeviceRuntime)
            // saves the device automatically on `connected`. The server rejects auth.update
            // until a device is linked, so we observe the `device.save:ok` ack (subscribed
            // before connect to avoid missing it) and only then run auth.update.
            const registered = this.waitForDeviceRegistered(client);
            await this.manager.connect();
            await registered;
            await this.updateAuth('bootstrap');
        } catch (error) {
            logger.error('SOCKET', '[SocketSessionController] failed during bootstrap sequence', { error });
        }
    }

    /**
     * Resolves once the connection's device.save has been acknowledged. createDeviceRuntime
     * issues device.save on `connected`, and its `:ok` / `:error` response is delivered to
     * every onMessage listener. Resolves on any `device.save:` response, or after a timeout
     * so a missing/failed save cannot wedge bootstrap (auth.update then fails into recovery).
     */
    private waitForDeviceRegistered(client: ClientSocketV2, timeoutMs = DEVICE_REGISTER_TIMEOUT_MS): Promise<void> {
        return new Promise<void>(resolve => {
            let settled = false;
            let unsubscribe: (() => void) | null = null;
            let timer: ReturnType<typeof setTimeout> | null = null;

            const finish = () => {
                if (settled) return;
                settled = true;
                unsubscribe?.();
                if (timer) clearTimeout(timer);
                resolve();
            };

            unsubscribe = client.onMessage(({ message }) => {
                if (typeof message?.type === 'string' && message.type.startsWith('device.save:')) {
                    finish();
                }
            });

            timer = setTimeout(() => {
                logger.warn('SOCKET', '[SocketSessionController] device.save ack not observed before timeout');
                finish();
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
            await client.request('auth.update', { token });
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

                await client.request('auth.update', { token });
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

    private startPeriodicRefresh() {
        this.stopPeriodicRefresh();
        this.refreshInterval = setInterval(() => {
            const state = this.manager.getSnapshot();
            // 소켓이 연결되어 있을 때만 업데이트를 수행하고, 세션 유무는 updateAuth 내부에서 토큰 획득 여부로 판단합니다.
            if (state.isConnected) {
                void this.updateAuth('periodic-refresh');
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
