import type {
    AppMessageData,
    AppMessageType,
    WebMessageData,
    WebMessageResponse,
    WebMessageType,
} from '@chatic/app-messages';
import type { EnvironmentConfig, IMessageQueue, RequestMessage } from '../common';
import type { BridgeAdapter } from './adapters/types';

/**
 * An internal interface representing the state of an in-flight async request between Web and App.
 */
export interface PendingRequest {
    /** The Resolve callback to call when a successful response arrives */
    resolve: (value: any) => void;
    /** The Reject callback to call on error or timeout */
    reject: (reason: any) => void;
    /** The timer ID for the timeout watch */
    timeoutId?: ReturnType<typeof setTimeout>;
    /** The maximum wait time (ms) specified for this request */
    timeoutMs: number;
    /** The original message type the web requested */
    requestType: WebMessageType;
    /** The expected response message type that native is supposed to send */
    expectedResponseType: AppMessageType;
    /** When `request` was called, on the client's clock */
    calledAt?: number;
    /** When the request left for the adapter — later than `calledAt` if it waited in the readiness buffer */
    dispatchedAt?: number;
    /** Length of the encoded request, when the adapter reported one */
    requestLength?: number;
    /** How many other dispatched requests were still unanswered when this one left */
    inFlightAtDispatch?: number;
}

/**
 * One request's journey through the bridge, as the web side saw it.
 *
 * Only requests that were actually dispatched are reported: one rejected before it left (no
 * channel, a destroyed client) measures nothing about the bridge.
 */
export interface BridgeRequestSample {
    /** The request's message type */
    type: WebMessageType;
    /** `ok`, or the `BridgeError` code it was rejected with (a host error passes its own code) */
    outcome: string;
    /**
     * Call → dispatch: time spent in the readiness buffer. Zero once the channel is up. Absent for a
     * request called before the observer was attached, whose wait cannot be known.
     */
    queuedMs?: number;
    /** Dispatch → settle: the round trip, including the handler's own work on the app side */
    roundTripMs: number;
    /** Encoded request length, when the adapter reported one */
    requestLength?: number;
    /** Raw reply length, when the adapter reported one. Absent on a timeout. */
    responseLength?: number;
    /** Other dispatched requests still unanswered when this one left */
    inFlightAtDispatch: number;
}

/** Receives a sample as each dispatched request settles. Must not throw; a throw is swallowed. */
export type BridgeRequestObserver = (sample: BridgeRequestSample) => void;

/**
 * The configuration spec for creating a WebBridgeClient.
 */
export interface WebBridgeClientConfig {
    /** The actual physical transport adapter to use */
    adapter: BridgeAdapter;
    /** The bridge protocol version (default: the library's built-in protocol version) */
    version?: string;
    /** The default request timeout (default: 10000ms) */
    timeoutMs?: number;
    /** The timeout for waiting on native bridge readiness (default: 10000ms) */
    bridgeReadyTimeoutMs?: number;
    /** A function that checks whether the native bridge is injected in the current environment (default: auto-detected via the window object) */
    isBridgeAvailable?: () => boolean;
    /** The message queue that buffers requests until the bridge is ready (default: an in-memory MessageQueue) */
    pendingBuffer?: IMessageQueue<RequestMessage>;
    /** Environment configuration options for testing/simulation */
    environment?: EnvironmentConfig;
    /** The clock request samples are measured on (default: `performance.now()`, else `Date.now()`) */
    now?: () => number;
}

/**
 * The standard bridge client interface for communicating with the App (Native) from the Web environment.
 */
export interface IWebBridgeClient {
    /**
     * [Web -> App] One-way message send that doesn't wait for a response (Fire-and-Forget)
     * @param message The WebMessage-spec object to send
     */
    post<K extends WebMessageType>(message: WebMessageData<K>): void;

    /**
     * [Web -> App] Sends a request to the app and asynchronously awaits the corresponding success response. (Request-Response)
     * Rejects on a bridge error or a native handler error.
     * @param message The WebMessage-spec object to send
     * @param options Additional options (e.g. specifying a per-call timeoutMs)
     */
    request<K extends WebMessageType>(
        message: WebMessageData<K>,
        options?: { timeoutMs?: number }
    ): Promise<WebMessageResponse<K>>;

    /**
     * [App -> Web] Subscribes to one-way events spontaneously raised by the native app. (Event Subscription)
     * @param type The AppMessage type to subscribe to
     * @param handler The callback function that receives the event
     * @returns A cleanup (unsubscribe) function
     */
    onEvent<K extends AppMessageType>(type: K, handler: (message: AppMessageData<K>) => void): () => void;

    /**
     * Dynamically changes the bridge's runtime environment (latency, drops, forced failures, etc.) at runtime, for testing and debugging.
     * @param config The environment configuration object to apply (omit it, or pass undefined, to restore the default state)
     */
    configureEnvironment(config?: EnvironmentConfig): void;

    /**
     * Tears down the bridge client and cleans up the polling timer and registered event listeners. (prevents memory leaks)
     */
    destroy(): void;

    /**
     * Reports every dispatched request as it settles, or stops reporting when called with nothing.
     * One observer at a time; a later call replaces the earlier one.
     * @param observer Receives one sample per settled request
     */
    setRequestObserver(observer?: BridgeRequestObserver): void;

    /**
     * Dynamically swaps the bridge's physical transport adapter at runtime. (e.g. swapping in InMemoryAdapter for testing)
     * @param adapter The new physical transport adapter
     */
    setAdapter(adapter: BridgeAdapter): void;
}
