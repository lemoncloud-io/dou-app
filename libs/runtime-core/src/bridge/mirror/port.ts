import type {
    OnRuntimeCallPayload,
    OnRuntimeEventPayload,
    OnRuntimeSessionChangedPayload,
    RuntimeCallPayload,
    RuntimeSubscribePayload,
    RuntimeUnsubscribePayload,
} from '@chatic/bridge-messages';

/**
 * How a mirror reaches the runtime it mirrors: the three requests it sends and the two pushes it hears.
 * In a page this is the bridge to its shell (`@chatic/runtime-web`); in a test it is a host in the same
 * process. Messages are delivered in the order they were sent, both ways — the mirror relies on a
 * session push sent before a call's answer arriving before it.
 *
 * A request that fails rejects with the failure the other side answered (`{ code, message, details }`)
 * or the transport's own error (a timeout); the mirror turns either into the error a screen reads.
 */
export interface RuntimeMirrorPort {
    call(payload: RuntimeCallPayload): Promise<OnRuntimeCallPayload>;
    subscribe(payload: RuntimeSubscribePayload): Promise<unknown>;
    unsubscribe(payload: RuntimeUnsubscribePayload): Promise<unknown>;
    onEvent(listener: (payload: OnRuntimeEventPayload) => void): () => void;
    onSessionChanged(listener: (payload: OnRuntimeSessionChangedPayload) => void): () => void;
}
