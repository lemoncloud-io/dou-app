import type {
    OnRuntimeCallPayload,
    OnRuntimeEventPayload,
    OnRuntimeSessionChangedPayload,
    RuntimeCallPayload,
    RuntimeSubscribePayload,
    RuntimeUnsubscribePayload,
} from '@chatic/bridge-messages';

export interface RuntimeMirrorPort {
    call(payload: RuntimeCallPayload): Promise<OnRuntimeCallPayload>;
    subscribe(payload: RuntimeSubscribePayload): Promise<unknown>;
    unsubscribe(payload: RuntimeUnsubscribePayload): Promise<unknown>;
    onEvent(listener: (payload: OnRuntimeEventPayload) => void): () => void;
    onSessionChanged(listener: (payload: OnRuntimeSessionChangedPayload) => void): () => void;
}
