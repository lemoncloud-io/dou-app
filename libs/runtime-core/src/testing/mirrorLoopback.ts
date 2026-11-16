import type {
    OnRuntimeEventPayload,
    OnRuntimeHelloPayload,
    OnRuntimeSessionChangedPayload,
} from '@chatic/bridge-messages';

import type { RuntimeEngine } from '../engine';
import { RUNTIME_CONTRACT_VERSION } from '../bridge/contract';
import { createRuntimeBridgeHost } from '../bridge/host';
import type { RuntimeBridgeHostOptions } from '../bridge/host';
import type { RuntimeMirrorPort } from '../bridge/mirror/port';

/**
 * A shell host and a mirror port in one process, joined the way a bridge joins them: every answer and
 * every push is delivered in the order it was sent, each on a later turn than the one that sent it.
 * For tests.
 */
export const createLoopback = (engine: RuntimeEngine, options: Partial<RuntimeBridgeHostOptions> = {}) => {
    const queue: (() => void)[] = [];
    let draining = false;
    const drain = () => {
        if (draining) return;
        draining = true;
        void Promise.resolve().then(() => {
            draining = false;
            const batch = queue.splice(0);
            batch.forEach(deliver => deliver());
            if (queue.length > 0) drain();
        });
    };
    const enqueue = (deliver: () => void) => {
        queue.push(deliver);
        drain();
    };

    const eventListeners = new Set<(payload: OnRuntimeEventPayload) => void>();
    const sessionListeners = new Set<(payload: OnRuntimeSessionChangedPayload) => void>();
    const host = createRuntimeBridgeHost({
        engine: async () => engine,
        send: {
            event: payload => enqueue(() => eventListeners.forEach(listener => listener(payload))),
            sessionChanged: payload => enqueue(() => sessionListeners.forEach(listener => listener(payload))),
        },
        ...options,
    });

    /** Sends a request to the host and delivers its answer in order with the pushes. */
    const answer = <T>(asked: Promise<{ value: T } | { failure: unknown }>): Promise<T> =>
        asked.then(
            result =>
                new Promise<T>((resolve, reject) =>
                    enqueue(() => ('value' in result ? resolve(result.value) : reject(result.failure)))
                )
        );

    const port: RuntimeMirrorPort = {
        call: payload => answer(host.call(payload)),
        subscribe: payload => answer(host.subscribe(payload)),
        unsubscribe: payload => answer(Promise.resolve(host.unsubscribe(payload))),
        onEvent: listener => {
            eventListeners.add(listener);
            return () => eventListeners.delete(listener);
        },
        onSessionChanged: listener => {
            sessionListeners.add(listener);
            return () => sessionListeners.delete(listener);
        },
    };

    /** Says hello and returns the `native` answer the mirror is built from. */
    const hello = async () => {
        const answered = await host.hello({ contracts: [RUNTIME_CONTRACT_VERSION] });
        if (!('value' in answered) || answered.value.sessionOwner !== 'native') {
            throw new Error('the loopback host did not answer native');
        }
        return answered.value as Extract<OnRuntimeHelloPayload, { sessionOwner: 'native' }>;
    };

    /** Lets every queued delivery, and what it queues in turn, run. */
    const settle = async () => {
        for (let turn = 0; turn < 20; turn += 1) await Promise.resolve();
    };

    return { host, port, hello, settle };
};
