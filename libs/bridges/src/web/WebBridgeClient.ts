import { logger } from '@chatic/logger';

import type { BridgeAdapter } from './adapters/types';
import type { EventMessage, RequestMessage, ResponseMessage, EnvironmentConfig, IMessageQueue } from '../common';
import { MessageQueue } from '../common';
import type { IWebBridgeClient, WebBridgeClientConfig, PendingRequest } from './types';
import {
    WEB_MESSAGE_RESPONSE_TYPE,
    type AppMessageData,
    type AppMessageType,
    type BridgeError,
    type WebMessageData,
    type WebMessageResponse,
    type WebMessageType,
} from '@chatic/app-messages';
import { BRIDGE_PROTOCOL_VERSION } from '../version';

/**
 * The core implementation class of the bridge client that runs in the Web runtime environment.
 * Detects whether the native channel is ready and oversees both async requests (Request-Response) and event listener subscriptions.
 */
export class WebBridgeClient implements IWebBridgeClient {
    private adapter: BridgeAdapter;
    private version: string;
    private timeoutMs: number;
    private bridgeReadyTimeoutMs: number;
    private isBridgeAvailable: () => boolean;
    private environment?: EnvironmentConfig;

    /** The listener map that routes incoming native events */
    private eventListeners = new Map<string, Set<(message: any) => void>>();
    /** The map of pending requests currently awaiting a response (key: refId) */
    private pendingRequests = new Map<string, PendingRequest>();

    /** The bridge channel readiness state flag */
    private isReady = false;
    /** Whether readiness failed because the bridge-ready timeout expired */
    private availabilityFailed = false;
    /** The in-memory buffer that temporarily holds requests until the bridge is ready */
    private pendingBuffer: IMessageQueue<RequestMessage>;

    /** The callback that unsubscribes from adapter messages */
    private unsubscribeAdapter?: () => void;
    /** The polling timer ID used to detect the native bridge's presence */
    private detectionIntervalId?: ReturnType<typeof setInterval>;
    /** The timeout ID for the native-bridge-readiness wait deadline */
    private detectionTimeoutId?: ReturnType<typeof setTimeout>;

    constructor(config: WebBridgeClientConfig) {
        this.adapter = config.adapter;
        this.version = config.version ?? BRIDGE_PROTOCOL_VERSION;
        this.timeoutMs = config.timeoutMs ?? 10000;
        this.bridgeReadyTimeoutMs = config.bridgeReadyTimeoutMs ?? 10000;
        this.isBridgeAvailable = config.isBridgeAvailable ?? this.checkNativeBridgeAvailable;
        this.pendingBuffer = config.pendingBuffer ?? new MessageQueue();
        this.environment = config.environment;

        // Binds the listener that receives incoming messages from the adapter and stores the unsubscribe function.
        this.unsubscribeAdapter = this.adapter.onMessage(this.handleMessage);

        // Starts watching for the native bridge.
        this.initBridgeDetection();
    }

    /**
     * [Internal] Checks in real time whether the bridge is injected for each platform on the browser global object (window).
     */
    private checkNativeBridgeAvailable = (): boolean => {
        if (typeof window === 'undefined') return false;
        return !!(
            window.ReactNativeWebView?.postMessage ||
            window.ChaticMessageHandler?.postMessage ||
            window.webkit?.messageHandlers?.ChaticMessageHandler?.postMessage
        );
    };

    /**
     * [Internal] Runs a polling loop until the bridge is detected, if it hasn't been detected yet.
     * In an SSR (server-side) environment, immediately closes out the state as a readiness failure (NATIVE_NOT_SUPPORTED).
     */
    private initBridgeDetection(): void {
        // 1. Handle SSR: if window doesn't exist, fail immediately without waiting, to avoid wasting timer resources
        if (typeof window === 'undefined') {
            this.failBufferedRequests();
            return;
        }

        // 2. If the bridge is already available, become ready immediately
        if (this.isBridgeAvailable()) {
            this.isReady = true;
            this.flushBuffer();
            return;
        }

        // 3. Start detection polling every 50ms until the bridge appears
        this.detectionIntervalId = setInterval(() => {
            if (this.isBridgeAvailable()) {
                this.clearDetectionTimers();
                this.isReady = true;
                this.flushBuffer();
            }
        }, 50);

        // 4. Start the detection wait timeout (10s by default)
        this.detectionTimeoutId = setTimeout(() => {
            this.clearDetectionTimers();
            if (!this.isReady) {
                this.failBufferedRequests();
            }
        }, this.bridgeReadyTimeoutMs);
    }

    /**
     * [Internal] Safely clears the watch timer resources.
     */
    private clearDetectionTimers(): void {
        if (this.detectionIntervalId) {
            clearInterval(this.detectionIntervalId);
            this.detectionIntervalId = undefined;
        }
        if (this.detectionTimeoutId) {
            clearTimeout(this.detectionTimeoutId);
            this.detectionTimeoutId = undefined;
        }
    }

    /**
     * [Internal] Emits the messages accumulated in the pending queue (buffer) out to native once the bridge becomes active.
     */
    private flushBuffer(): void {
        while (!this.pendingBuffer.isEmpty()) {
            const message = this.pendingBuffer.dequeue();
            if (message) {
                const refId = message.refId;
                // A request-type message needs its timer started, so delegate to dispatchRequest
                if (refId && this.pendingRequests.has(refId)) {
                    this.dispatchRequest(message);
                } else {
                    this.adapter.postMessage(message);
                }
            }
        }
    }

    /**
     * [Internal] Actually sends the request message to the adapter and starts that request's timeout countdown.
     */
    private dispatchRequest(message: RequestMessage): void {
        const refId = message.refId;

        if (refId) {
            const pending = this.pendingRequests.get(refId);
            if (pending) {
                // A request that had been sitting in the buffer starts its timeout wait only once it's actually dispatched.
                pending.timeoutId = setTimeout(() => {
                    this.pendingRequests.delete(refId);
                    pending.reject({
                        code: 'TIMEOUT',
                        message: `Request timed out after ${pending.timeoutMs}ms`,
                        reason: 'No response was received before the configured timeout.',
                        requestType: pending.requestType,
                        expectedResponseType: pending.expectedResponseType,
                        protocolVersion: this.version,
                        webVersion: this.version,
                        recoverable: true,
                    });
                }, pending.timeoutMs);
            }
        }

        this.adapter.postMessage(message);
    }

    /**
     * [Internal] When the wait for bridge activation finally expires, error out every request in the queue and pending map.
     */
    private failBufferedRequests(): void {
        this.availabilityFailed = true;
        this.pendingBuffer.clear();

        // Reject the pending requests that haven't actually been sent to native yet (whose timeout watch never started)
        this.pendingRequests.forEach(pending => {
            if (pending.timeoutId) return;
            pending.reject(this.createNativeNotSupportedError(pending.requestType));
        });

        // Make sure the rejected requests are removed from the pending map
        [...this.pendingRequests.entries()].forEach(([refId, pending]) => {
            if (!pending.timeoutId) this.pendingRequests.delete(refId);
        });
    }

    /**
     * [Internal] Validates the raw message delivered from the adapter and routes it by determining its target.
     */
    private handleMessage = (message: ResponseMessage | EventMessage): void => {
        // Drop the event early if drop simulation is configured
        if (this.shouldDrop()) return;

        // Apply a decoding delay if RTT delay simulation is configured
        const delay = (this.environment?.rttDelayMs ?? 0) / 2;
        if (delay > 0) {
            setTimeout(() => this.processReceivedMessage(message), delay);
        } else {
            this.processReceivedMessage(message);
        }
    };

    /**
     * [Internal] Makes the final call on whether an actually received message is a Response or an Event.
     */
    private processReceivedMessage(message: ResponseMessage | EventMessage): void {
        const refId = message.refId;

        // If it has a `success` property and refId is pending in the map, it's a Response to a request
        if ('success' in message && refId && this.pendingRequests.has(refId)) {
            // Simulation: force injection of malformed data
            if (this.environment?.malformedResponse) {
                this.handleResponse({
                    refId,
                    version: message.version,
                    type: 'ERROR',
                    success: true,
                } as unknown as ResponseMessage);
                return;
            }

            // Simulation: force injection of a fake response-type mismatch
            if (this.environment?.responseTypeMismatch && message.success) {
                const mismatchType =
                    typeof this.environment.responseTypeMismatch === 'string'
                        ? this.environment.responseTypeMismatch
                        : 'OnFetchSafeArea';
                this.handleResponse({
                    ...message,
                    type: mismatchType,
                } as ResponseMessage);
                return;
            }

            this.handleResponse(message as ResponseMessage);
        } else {
            // Treated as an event when it isn't in the pending map, or when it's one-way data
            this.handleEvent(message as EventMessage);
        }
    }

    /**
     * [Internal] Ends the lifetime of the matched pending request and settles (resolve/reject) its promise.
     */
    private handleResponse(message: ResponseMessage): void {
        const refId = message.refId;
        if (!refId) return;

        const pending = this.pendingRequests.get(refId);
        if (!pending) return;

        // Stop the timeout watch
        if (pending.timeoutId) {
            clearTimeout(pending.timeoutId);
        }
        this.pendingRequests.delete(refId);

        // Reject on receiving an app/native business-logic error
        if (!message.success) {
            pending.reject(message.error);
            return;
        }

        // Runtime protocol guard: block if the result differs from the promised response type
        if (message.type !== pending.expectedResponseType) {
            pending.reject(
                this.createResponseTypeMismatchError(
                    pending,
                    typeof message.type === 'string' ? message.type : undefined
                )
            );
            return;
        }

        pending.resolve(message);
    }

    /**
     * [Internal] Dispatches the data object to the registered event listeners.
     */
    private handleEvent(message: EventMessage): void {
        const listeners = this.eventListeners.get(message.type);
        listeners?.forEach(listener => listener(message));
    }

    /**
     * [Internal] Issues a unique identifier key (refId) for managing the pending map.
     */
    private generateRefId(): string {
        return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
    }

    /**
     * [Web -> App] Sends a one-way native command that doesn't need a response.
     */
    public post<K extends WebMessageType>(message: WebMessageData<K>): void {
        const type = message.type;
        if (this.availabilityFailed) {
            // `createNativeForwarder` uses `NativeBridgeAdapter` directly, so this class is
            // outside the log delivery path — calling logger here doesn't recurse.
            //
            // Why debug instead of warn: outside the native shell (browser, desktop), the
            // interface being absent is normal, and if a warn fired on every single post in that
            // environment, this one line would dominate most of a batch in continuous uploads
            // (dozens of hits from just SetBadgeCount alone).
            //
            // debug is dropped by both persistent sinks (the upload queue and Crashlytics), so
            // in a release build it lands nowhere at all. The reason that's acceptable is that
            // this condition only ever means one of two things: it's normal in the browser and
            // there's nothing worth recording, or it happened in the native shell, in which case
            // the bridge is dead entirely and this line adds nothing that isn't already obvious.
            logger.debug('BRIDGE', `[WebBridgeClient] post [${String(type)}] ignored — no native bridge interface`);
            return;
        }

        if (this.shouldDrop()) return;

        const requestMessage = this.createRequestMessage(message);

        const send = () => {
            if (!this.isReady) {
                this.pendingBuffer.enqueue(requestMessage);
            } else {
                this.adapter.postMessage(requestMessage);
            }
        };

        const delay = (this.environment?.rttDelayMs ?? 0) / 2;
        if (delay > 0) {
            setTimeout(send, delay);
        } else {
            send();
        }
    }

    /**
     * [Web -> App] Sends a command to the native app and returns a promise for the resulting response.
     */
    public request<K extends WebMessageType>(
        message: WebMessageData<K>,
        options?: { timeoutMs?: number }
    ): Promise<WebMessageResponse<K>> {
        const requestType = message.type;
        const expectedResponseType = WEB_MESSAGE_RESPONSE_TYPE[requestType];
        if (this.availabilityFailed) {
            return Promise.reject(this.createNativeNotSupportedError(requestType));
        }

        // Simulation: reject immediately when forced-instant-error is configured
        if (this.environment?.forceFailure) {
            const failure = typeof this.environment.forceFailure === 'object' ? this.environment.forceFailure : {};
            const delay = this.environment?.rttDelayMs ?? 0;
            return new Promise((_, reject) => {
                setTimeout(() => {
                    reject({
                        code: failure.code ?? 'BRIDGE_SIMULATION_FAILURE',
                        message: failure.message ?? '브릿지 시뮬레이션 설정에 의해 요청이 실패했습니다.',
                        reason: 'The bridge simulation was configured to fail before reaching the app host.',
                        requestType,
                        expectedResponseType,
                        protocolVersion: this.version,
                        webVersion: this.version,
                        recoverable: failure.recoverable ?? true,
                    });
                }, delay);
            });
        }

        // Simulation: forcing an indefinite response-delay timeout
        if (this.environment?.timeoutMode) {
            const timeoutMs = options?.timeoutMs ?? this.timeoutMs;
            return new Promise((resolve, reject) => {
                const refId = this.generateRefId();
                const timeoutId = setTimeout(() => {
                    this.pendingRequests.delete(refId);
                    reject({
                        code: 'TIMEOUT',
                        message: `Request timed out after ${timeoutMs}ms`,
                        reason: 'No response was received before the configured timeout.',
                        requestType,
                        expectedResponseType,
                        protocolVersion: this.version,
                        webVersion: this.version,
                        recoverable: true,
                    });
                }, timeoutMs);

                this.pendingRequests.set(refId, {
                    resolve,
                    reject,
                    timeoutId,
                    timeoutMs,
                    requestType,
                    expectedResponseType,
                });
            });
        }

        if (this.shouldDrop()) {
            return new Promise(() => {
                /* drop, never resolves */
            });
        }

        return new Promise((resolve, reject) => {
            const requestMessage = this.createRequestMessage(message);
            const refId = requestMessage.refId ?? this.generateRefId();
            requestMessage.refId = refId;

            this.pendingRequests.set(refId, {
                resolve,
                reject,
                timeoutMs: options?.timeoutMs ?? this.timeoutMs,
                requestType,
                expectedResponseType,
            });

            const send = () => {
                if (!this.isReady) {
                    this.pendingBuffer.enqueue(requestMessage);
                } else {
                    this.dispatchRequest(requestMessage);
                }
            };

            const delay = (this.environment?.rttDelayMs ?? 0) / 2;
            if (delay > 0) {
                setTimeout(send, delay);
            } else {
                send();
            }
        });
    }

    /**
     * [App -> Web] Binds the handler function that watches for one-way native events.
     */
    public onEvent<K extends AppMessageType>(type: K, handler: (message: AppMessageData<K>) => void): () => void {
        const typeStr = type as string;
        if (!this.eventListeners.has(typeStr)) {
            this.eventListeners.set(typeStr, new Set());
        }

        const listeners = this.eventListeners.get(typeStr)!;
        listeners.add(handler as any);

        return () => {
            listeners.delete(handler as any);
            if (listeners.size === 0) this.eventListeners.delete(typeStr);
        };
    }

    /**
     * [Internal] Determines whether a message should be lost, based on the configured drop-rate simulation value.
     */
    private shouldDrop(): boolean {
        const rate = this.environment?.dropRate ?? 0;
        if (rate <= 0) return false;
        if (rate >= 1) return true;
        const rand = this.environment?.random ?? Math.random;
        return rand() < rate;
    }

    /**
     * Overwrites the simulation variables that drive the bridge's runtime communication behavior, for testing and debugging.
     */
    public configureEnvironment(config?: EnvironmentConfig): void {
        this.environment = config;
    }

    /**
     * Tears down the bridge client's active state and removes the timers and adapter listener bindings that were created.
     */
    public destroy(): void {
        // 1. Remove the detection poller and timers
        this.clearDetectionTimers();

        // 2. Unbind the adapter event subscription
        if (this.unsubscribeAdapter) {
            this.unsubscribeAdapter();
            this.unsubscribeAdapter = undefined;
        }

        // 3. Empty the pending buffer queue
        this.pendingBuffer.clear();

        // 4. Reject every still-pending promise, then clear the map
        this.pendingRequests.forEach(pending => {
            if (pending.timeoutId) {
                clearTimeout(pending.timeoutId);
            }
            pending.reject({
                code: 'DESTROYED',
                message: '브릿지 클라이언트가 파괴되어 대기 중인 비동기 약속이 거절되었습니다.',
                requestType: pending.requestType,
                expectedResponseType: pending.expectedResponseType,
                recoverable: false,
            });
        });
        this.pendingRequests.clear();
        this.eventListeners.clear();
        this.isReady = false;
    }

    /**
     * Dynamically swaps the bridge's physical transport adapter at runtime.
     */
    public setAdapter(adapter: BridgeAdapter): void {
        if (this.unsubscribeAdapter) {
            this.unsubscribeAdapter();
        }
        this.adapter = adapter;
        this.unsubscribeAdapter = this.adapter.onMessage(this.handleMessage);
    }

    /**
     * [Internal] Wraps the web call-spec data into a bridge-framework transport message object.
     */
    private createRequestMessage<K extends WebMessageType>(message: WebMessageData<K>): RequestMessage {
        return {
            version: this.version,
            ...message,
            refId: message.refId ?? this.generateRefId(),
        } as unknown as RequestMessage;
    }

    /**
     * [Internal] Builds the error spec to return when the response type differs from what was expected.
     */
    private createResponseTypeMismatchError(pending: PendingRequest, actualResponseType?: string): BridgeError {
        return {
            code: 'RESPONSE_TYPE_MISMATCH',
            message: `Unexpected bridge response type: expected ${pending.expectedResponseType}, received ${actualResponseType ?? 'unknown'}.`,
            reason: 'The native app and web bundle may be using different bridge protocol versions.',
            requestType: pending.requestType,
            expectedResponseType: pending.expectedResponseType,
            actualResponseType,
            protocolVersion: this.version,
            webVersion: this.version,
            recoverable: true,
        };
    }

    /**
     * [Internal] Builds the error spec to return when a request is attempted from a plain browser where the native bridge isn't available.
     */
    private createNativeNotSupportedError(requestType: WebMessageType): BridgeError {
        return {
            code: 'NATIVE_NOT_SUPPORTED',
            message: '일반 브라우저 환경에서는 네이티브 브릿지 기능을 사용할 수 없습니다.',
            reason: 'No native bridge adapter became available before the configured readiness timeout.',
            requestType,
            protocolVersion: this.version,
            webVersion: this.version,
            recoverable: true,
        };
    }
}
