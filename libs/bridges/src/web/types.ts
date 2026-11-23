import type {
    AppMessageData,
    AppMessageType,
    WebMessageData,
    WebMessageResponse,
    WebMessageType,
} from '@chatic/bridge-messages';
import type { IMessageQueue, RequestMessage } from '../common';
import type { BridgeAdapter } from './adapters/types';

export interface PendingRequest {
    resolve: (value: any) => void;
    reject: (reason: any) => void;
    timeoutId?: ReturnType<typeof setTimeout>;
    timeoutMs: number;
    remainingMs?: number;
    armedAt?: number;
    timeoutPaused?: boolean;
    requestType: WebMessageType;
    expectedResponseType: AppMessageType;
    calledAt?: number;
    dispatchedAt?: number;
    requestLength?: number;
    inFlightAtDispatch?: number;
}

export interface BridgeRequestSample {
    type: WebMessageType;
    outcome: string;
    queuedMs?: number;
    roundTripMs: number;
    requestLength?: number;
    responseLength?: number;
    inFlightAtDispatch: number;
}

export type BridgeRequestObserver = (sample: BridgeRequestSample) => void;

export interface WebBridgeClientConfig {
    adapter: BridgeAdapter;
    version?: string;
    timeoutMs?: number;
    bridgeReadyTimeoutMs?: number;
    isBridgeAvailable?: () => boolean;
    pendingBuffer?: IMessageQueue<RequestMessage>;
    now?: () => number;
    visibility?: PageVisibilitySource;
}

export interface PageVisibilitySource {
    isHidden(): boolean;
    subscribe(listener: () => void): () => void;
}

export interface IWebBridgeClient {
    post<K extends WebMessageType>(message: WebMessageData<K>): void;

    request<K extends WebMessageType>(
        message: WebMessageData<K>,
        options?: { timeoutMs?: number }
    ): Promise<WebMessageResponse<K>>;

    onEvent<K extends AppMessageType>(type: K, handler: (message: AppMessageData<K>) => void): () => void;

    destroy(): void;

    setRequestObserver(observer?: BridgeRequestObserver): void;

    setAdapter(adapter: BridgeAdapter): void;
}
