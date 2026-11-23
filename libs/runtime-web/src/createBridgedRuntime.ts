import type { OnRuntimeSessionChangedPayload, RuntimeWireValue } from '@chatic/bridge-messages';
import { webClient } from '@chatic/bridges';
import type { IWebBridgeClient } from '@chatic/bridges';
import { createMirrorEngine } from '@chatic/runtime-core';
import type { MirrorEngine, RuntimeMirrorPort } from '@chatic/runtime-core';

export const RUNTIME_CALL_TIMEOUT_MS = 60_000;

export const webMirrorPort = (
    client: IWebBridgeClient = webClient,
    requestTimeoutMs = RUNTIME_CALL_TIMEOUT_MS
): RuntimeMirrorPort => {
    const sessionListeners = new Set<(payload: OnRuntimeSessionChangedPayload) => void>();
    let held: OnRuntimeSessionChangedPayload | null = null;
    client.onEvent('OnRuntimeSessionChanged', ({ data }) => {
        if (sessionListeners.size > 0) {
            sessionListeners.forEach(listener => listener(data));
            return;
        }
        if (!held || data.seq > held.seq) {
            const signals = [...new Set([...(held?.signals ?? []), ...(data.signals ?? [])])];
            held = { ...data, signals };
        }
    });

    return {
        call: async payload =>
            (await client.request({ type: 'RuntimeCall', data: payload }, { timeoutMs: requestTimeoutMs })).data,
        subscribe: payload =>
            client.request({ type: 'RuntimeSubscribe', data: payload }, { timeoutMs: requestTimeoutMs }),
        unsubscribe: payload => client.request({ type: 'RuntimeUnsubscribe', data: payload }),
        onEvent: listener => client.onEvent('OnRuntimeEvent', message => listener(message.data)),
        onSessionChanged: listener => {
            sessionListeners.add(listener);
            if (held) {
                const replay = held;
                held = null;
                listener(replay);
            }
            return () => sessionListeners.delete(listener);
        },
    };
};

export interface BridgedRuntimeOptions {
    hello: { seq: number; session: RuntimeWireValue };
    port: RuntimeMirrorPort;
}

export const createBridgedRuntime = ({ hello, port }: BridgedRuntimeOptions): MirrorEngine =>
    createMirrorEngine({ port, hello });
