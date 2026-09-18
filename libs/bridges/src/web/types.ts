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
}

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
     * Dynamically swaps the bridge's physical transport adapter at runtime. (e.g. swapping in InMemoryAdapter for testing)
     * @param adapter The new physical transport adapter
     */
    setAdapter(adapter: BridgeAdapter): void;
}
