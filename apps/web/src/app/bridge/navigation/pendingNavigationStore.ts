import { logger, webClient } from '@chatic/bridges';
import type { AppMessageData } from '@chatic/bridge-messages';

import { bootSplash } from '../../runtime/bootSplash';

type OnNavigateMessage = AppMessageData<'OnNavigate'>;
type NavigationConsumer = (message: OnNavigateMessage) => void | Promise<unknown>;
type NavigationSubscribe = (handler: NavigationConsumer) => () => void;

export interface PendingNavigationStore {
    start(): void;
    stop(): void;
    register(consumer: NavigationConsumer): () => void;
}

export const createPendingNavigationStore = (
    subscribe: NavigationSubscribe,
    holdCover: () => () => void = () => () => undefined
): PendingNavigationStore => {
    let pending: OnNavigateMessage | null = null;
    let consumer: NavigationConsumer | null = null;
    let unsubscribe: (() => void) | null = null;
    let releaseCover: (() => void) | null = null;

    const dropCover = () => {
        releaseCover?.();
        releaseCover = null;
    };

    return {
        start: () => {
            if (unsubscribe) return;
            unsubscribe = subscribe(message => {
                if (consumer) {
                    consumer(message);
                } else {
                    logger.info('ROUTER', `OnNavigate held until handler mounts: ${message.data?.path}`);
                    pending = message;
                    releaseCover ??= holdCover();
                }
            });
        },
        stop: () => {
            unsubscribe?.();
            unsubscribe = null;
            pending = null;
            dropCover();
        },
        register: nextConsumer => {
            consumer = nextConsumer;
            if (pending) {
                const held = pending;
                pending = null;
                logger.info('ROUTER', `Replaying held OnNavigate to newly mounted handler: ${held.data?.path}`);
                let replay: unknown;
                try {
                    replay = nextConsumer(held);
                } catch (error) {
                    dropCover();
                    throw error;
                }
                void Promise.resolve(replay)
                    .catch(() => undefined)
                    .finally(dropCover);
            }
            return () => {
                if (consumer === nextConsumer) consumer = null;
            };
        },
    };
};

export const pendingNavigationStore = createPendingNavigationStore(
    handler => webClient.onEvent('OnNavigate', handler),
    () => bootSplash.hold()
);
