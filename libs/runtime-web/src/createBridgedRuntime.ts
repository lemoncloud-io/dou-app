import type { OnRuntimeSessionChangedPayload, RuntimeWireValue } from '@chatic/bridge-messages';
import { webClient } from '@chatic/bridges';
import type { IWebBridgeClient } from '@chatic/bridges';
import { createMirrorEngine } from '@chatic/runtime-core';
import type { MirrorEngine, RuntimeMirrorPort } from '@chatic/runtime-core';

/**
 * How long the page waits for one runtime request. The bridge's own default (10 s) is for a shell
 * handler that answers from the device; a runtime call can be a whole socket round trip or a cloud
 * switch, each with its own deadline inside the runtime, so this only catches an answer that never
 * comes. A subscribe waits as long: one given up on here would stay open in the shell until the next
 * hello.
 */
export const RUNTIME_CALL_TIMEOUT_MS = 60_000;

/**
 * The page's side of the runtime conversation, over the bridge to its shell.
 *
 * Make it before the page says hello. The shell pushes the session from the moment it answers, and
 * the mirror that takes the pushes is built only after the answer arrives; the port keeps the newest
 * push heard with no one listening and hands it to the first listener, so a change in between — a
 * sign-in finishing, a sign-out — is not lost. Older pushes are not kept: the newest carries the whole
 * session, and only its `signals` would be missing, which the port merges in.
 */
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
    /** The session the shell's `native` answer to the page's hello carried. */
    hello: { seq: number; session: RuntimeWireValue };
    /** The port made before the hello (`webMirrorPort`), so no push in between is lost. */
    port: RuntimeMirrorPort;
}

/**
 * Builds the engine of a page that mirrors its shell's runtime — the counterpart of the core engine for
 * a launch whose shell owns the session. `engine.mirror` builds it.
 *
 * Nothing is wired in the page: no stores, no sockets, no cache. Every member reaches the shell's
 * runtime across the bridge as runtime-core's contract says (`createMirrorEngine`). The entry point
 * makes the port, says hello, and calls this once the shell has answered `native` — never alongside
 * the core engine: one launch has one owner.
 */
export const createBridgedRuntime = ({ hello, port }: BridgedRuntimeOptions): MirrorEngine =>
    createMirrorEngine({ port, hello });
