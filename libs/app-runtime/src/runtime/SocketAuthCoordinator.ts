import { logger } from '@chatic/bridges';
import { sessionProfileResolver, webTransport } from '@chatic/web-core';
import type { DataRepositories } from '@chatic/data';
import { getSocketManager } from '../socket/runtime';
import { useCloudTransitionStore } from '../stores/useCloudTransitionStore';

type AuthRepository = DataRepositories['auth'];
type WssType = 'relay' | 'cloud' | undefined;

const nextTraceId = (prefix: string): string =>
    `${prefix}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;

class SocketAuthCoordinator {
    private queue: Promise<void> = Promise.resolve();
    private transitionDepth = 0;

    public isTransitioning(): boolean {
        return this.transitionDepth > 0;
    }

    public beginCloudTransition(cloudId: string): {
        traceId: string;
        finish: (result?: { ok?: boolean; error?: unknown }) => void;
    } {
        const traceId = nextTraceId('cloud-transition');
        this.transitionDepth++;
        useCloudTransitionStore.getState().begin(cloudId, traceId);
        logger.info('AUTH', '[SocketAuthCoordinator] cloud transition started', {
            data: { cloudId, traceId, depth: this.transitionDepth },
        });

        let finished = false;
        return {
            traceId,
            finish: result => {
                if (finished) return;
                finished = true;
                this.transitionDepth = Math.max(0, this.transitionDepth - 1);
                if (result?.ok === false) {
                    const message =
                        result.error instanceof Error ? result.error.message : String(result?.error ?? 'unknown');
                    useCloudTransitionStore.getState().fail(message, traceId);
                } else {
                    useCloudTransitionStore.getState().markReady(cloudId, traceId);
                }
                if (this.transitionDepth === 0 && result?.ok !== false) {
                    useCloudTransitionStore.getState().reset();
                }
                logger.info('AUTH', '[SocketAuthCoordinator] cloud transition finished', {
                    data: { cloudId, traceId, ok: result?.ok !== false, depth: this.transitionDepth },
                });
            },
        };
    }

    public markRecovering(): string {
        const traceId = nextTraceId('cloud-recovery');
        useCloudTransitionStore.getState().markRecovering(traceId);
        logger.info('AUTH', '[SocketAuthCoordinator] recovery started', { data: { traceId } });
        return traceId;
    }

    public async reauthenticateSocket({
        authRepository,
        reason,
        wssType,
        markUnverified = false,
    }: {
        authRepository: AuthRepository;
        reason: string;
        wssType?: WssType;
        markUnverified?: boolean;
    }): Promise<boolean> {
        if (markUnverified) {
            getSocketManager().markUnverified();
        }
        return this.enqueue(async () => {
            const token = await this.resolveToken(wssType);
            if (!token) {
                logger.warn('AUTH', '[SocketAuthCoordinator] skipped auth:update due to missing token', {
                    data: { reason, wssType },
                });
                return false;
            }

            logger.info('AUTH', '[SocketAuthCoordinator] auth:update', { data: { reason, wssType } });
            await authRepository.updateSocketAuth({ token });
            return true;
        });
    }

    public async refreshCloudTokenIfNeeded({
        refreshCloudToken,
        reason,
        wssType,
    }: {
        refreshCloudToken: (target?: string) => Promise<unknown>;
        reason: string;
        wssType?: WssType;
    }): Promise<boolean> {
        if (wssType !== 'cloud') {
            return false;
        }
        return this.enqueue(async () => {
            logger.info('AUTH', '[SocketAuthCoordinator] refresh cloud token', { data: { reason } });
            await refreshCloudToken();
            return true;
        });
    }

    private async resolveToken(wssType: WssType): Promise<string | null> {
        if (wssType === 'cloud') {
            return sessionProfileResolver.getCloudProfile().getIdentityToken();
        }
        return (await webTransport.getTokenSignature()).originToken?.identityToken ?? null;
    }

    private enqueue<T>(task: () => Promise<T>): Promise<T> {
        const run = this.queue.then(task, task);
        this.queue = run.then(
            () => undefined,
            () => undefined
        );
        return run;
    }
}

let socketAuthCoordinatorSingleton: SocketAuthCoordinator | null = null;

export const getSocketAuthCoordinator = (): SocketAuthCoordinator => {
    if (!socketAuthCoordinatorSingleton) {
        socketAuthCoordinatorSingleton = new SocketAuthCoordinator();
    }
    return socketAuthCoordinatorSingleton;
};
