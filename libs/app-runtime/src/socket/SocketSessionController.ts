import { logger } from '@chatic/bridges';
import type { ISocketManager, SocketBindingConfig, SocketScope, SocketSessionDelegate } from './types';

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

    public async bootstrap(config: SocketBindingConfig, scope: SocketScope): Promise<void> {
        this.manager.ensure(config, scope);
        this.startPeriodicRefresh();

        try {
            await this.manager.connect();
            const client = this.manager.getClient();
            if (!client) {
                throw new Error('Socket client not created');
            }

            await client.request('device.save', {
                id: config.deviceId,
                platform: 'web',
            });

            await this.updateAuth('bootstrap');
        } catch (error) {
            logger.error('SOCKET', '[SocketSessionController] failed during bootstrap sequence', { error });
        }
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
                const token = await this.delegate!.refreshSocketToken('socket-401');
                if (!token) {
                    throw new Error('Failed to obtain new token during recovery');
                }

                const client = this.manager.getClient();
                if (!client) {
                    throw new Error('Socket client is not available');
                }

                await client.request('auth.update', { token });
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
            // sid가 없으면 소켓 리프레시를 수행하지 않는다
            if (state.isConnected && state.siteId) {
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
