import { webClient } from '@chatic/bridges';
import type { AppMessageData } from '@chatic/app-messages';

type OnNavigateMessage = AppMessageData<'OnNavigate'>;
type NavigationConsumer = (message: OnNavigateMessage) => void;
type NavigationSubscribe = (handler: NavigationConsumer) => () => void;

export interface PendingNavigationStore {
    /** Begin capturing `OnNavigate` events. Idempotent — repeated calls keep one subscription. */
    start(): void;
    /** Stop capturing and drop any held event. Intended for teardown in tests. */
    stop(): void;
    /**
     * Attach the single active consumer. A held (pre-mount) event is delivered
     * immediately, then live events flow through directly. Returns a detach function.
     */
    register(consumer: NavigationConsumer): () => void;
}

/**
 * Buffers native `OnNavigate` events (push taps / deep links) that arrive before the
 * router-mounted handler exists.
 *
 * On cold start the native side flushes its event buffer as soon as the web app sends
 * *any* bridge message — long before the session is initialized and the router tree
 * (which hosts `useHandlePushNavigation`) has mounted. `WebBridgeClient` drops events
 * that have no listener, so the push tap silently vanished and the app booted to home.
 *
 * This store subscribes at app bootstrap (before render, so before any web→native
 * round trip can trigger the native flush) and holds the event until the handler
 * registers. Only the latest un-consumed event is kept: repeated taps during boot
 * should land on the last target, matching the rebase-to-home history convention.
 */
export const createPendingNavigationStore = (subscribe: NavigationSubscribe): PendingNavigationStore => {
    let pending: OnNavigateMessage | null = null;
    let consumer: NavigationConsumer | null = null;
    let unsubscribe: (() => void) | null = null;

    return {
        start: () => {
            if (unsubscribe) return;
            unsubscribe = subscribe(message => {
                if (consumer) {
                    consumer(message);
                } else {
                    pending = message;
                }
            });
        },
        stop: () => {
            unsubscribe?.();
            unsubscribe = null;
            pending = null;
        },
        register: nextConsumer => {
            consumer = nextConsumer;
            if (pending) {
                // Clear before delivering so a re-register (e.g. StrictMode remount)
                // cannot replay an already-consumed navigation.
                const held = pending;
                pending = null;
                nextConsumer(held);
            }
            return () => {
                if (consumer === nextConsumer) consumer = null;
            };
        },
    };
};

/** App-wide singleton wired to the bridge client. `start()` is called in `main.tsx`. */
export const pendingNavigationStore = createPendingNavigationStore(handler => webClient.onEvent('OnNavigate', handler));
