import { logger } from '@chatic/logger';

import type { BridgeAdapter, InboundMessageMeta } from './adapters/types';
import type { EventMessage, RequestMessage, ResponseMessage, IMessageQueue } from '../common';
import { isNative, MessageQueue } from '../common';
import type {
    BridgeRequestObserver,
    IWebBridgeClient,
    PageVisibilitySource,
    PendingRequest,
    WebBridgeClientConfig,
} from './types';
import {
    WEB_MESSAGE_RESPONSE_TYPE,
    type AppMessageData,
    type AppMessageType,
    type BridgeError,
    type WebMessageData,
    type WebMessageResponse,
    type WebMessageType,
} from '@chatic/app-messages';
import { BRIDGE_VERSION } from '../version';

/**
 * The least a held timeout gets back when the page shows again. On Android the replies held while
 * the app was paused land just before `visibilitychange` reports visible, but nothing promises that
 * order, so a request whose budget had nearly run out is still given time to receive its reply.
 */
const RESUMED_TIMEOUT_FLOOR_MS = 2000;

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
    private now: () => number;
    /** Receives a sample per settled request. Absent means nothing is measured at all. */
    private requestObserver?: BridgeRequestObserver;
    /** Holds request timeouts while the page is hidden. Absent outside a DOM. */
    private visibility?: PageVisibilitySource;
    /** The callback that unsubscribes from visibility changes */
    private unsubscribeVisibility?: () => void;

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
        this.version = config.version ?? BRIDGE_VERSION;
        this.timeoutMs = config.timeoutMs ?? 10000;
        this.bridgeReadyTimeoutMs = config.bridgeReadyTimeoutMs ?? 10000;
        this.isBridgeAvailable = config.isBridgeAvailable ?? isNative;
        this.pendingBuffer = config.pendingBuffer ?? new MessageQueue();
        this.now = config.now ?? defaultNow;
        this.visibility = config.visibility ?? createDocumentVisibility();
        this.unsubscribeVisibility = this.visibility?.subscribe(this.handleVisibilityChange);

        // Binds the listener that receives incoming messages from the adapter and stores the unsubscribe function.
        this.unsubscribeAdapter = this.adapter.onMessage(this.handleMessage);

        // Starts watching for the native bridge.
        this.initBridgeDetection();
    }

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
                if (this.requestObserver) {
                    pending.dispatchedAt = this.now();
                    pending.inFlightAtDispatch = this.countInFlight();
                }
                // A request that had been sitting in the buffer starts its timeout wait only once it's actually dispatched.
                pending.remainingMs = pending.timeoutMs;
                if (this.visibility?.isHidden()) {
                    pending.timeoutPaused = true;
                } else {
                    this.armTimeout(refId, pending);
                }
            }
        }

        const length = this.adapter.postMessage(message);
        if (refId && typeof length === 'number') {
            const pending = this.pendingRequests.get(refId);
            if (pending) pending.requestLength = length;
        }
    }

    /**
     * [Internal] Starts (or restarts) the countdown for what is left of a dispatched request's budget.
     */
    private armTimeout(refId: string, pending: PendingRequest, ms = pending.remainingMs ?? pending.timeoutMs): void {
        pending.armedAt = defaultNow();
        pending.timeoutId = setTimeout(() => {
            this.pendingRequests.delete(refId);
            this.reportSettled(pending, 'TIMEOUT');
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
        }, ms);
    }

    /**
     * [Internal] Holds every running timeout while the page is hidden and resumes them, with what
     * was left, once it is visible.
     *
     * A hidden page is one whose replies may not arrive at all until it shows again. On Android the
     * host's reply is a WebView command that React Native's renderer only runs from its frame
     * callback, which it stops while the activity is paused: a request answered in milliseconds while
     * another app (the SMS composer) is in front reaches the page only on return, and a timeout that
     * kept counting reported every such request as failed. The page's own timers keep running in that
     * state, so only the page can tell the wait apart from a real fault.
     */
    private handleVisibilityChange = (): void => {
        if (this.visibility?.isHidden()) {
            this.holdTimeouts();
        } else {
            this.resumeHeldTimeouts();
        }
    };

    /**
     * [Internal] Clears every running timer this client armed, keeping what was left of its budget.
     */
    private holdTimeouts(): void {
        // The budget is measured on the monotonic clock: a wall-clock correction, common right as a
        // device wakes, would otherwise shrink the remainder to nothing or stretch it past the budget.
        const now = defaultNow();
        this.pendingRequests.forEach(pending => {
            // Only a running timer: one still in the readiness buffer, or already held, has none.
            if (!pending.timeoutId || pending.armedAt === undefined) return;
            clearTimeout(pending.timeoutId);
            pending.timeoutId = undefined;
            const left = (pending.remainingMs ?? pending.timeoutMs) - (now - pending.armedAt);
            pending.remainingMs = Math.min(pending.timeoutMs, Math.max(0, left));
            pending.timeoutPaused = true;
        });
    }

    /**
     * [Internal] Re-arms every held timer with what was left of its budget, never less than the floor.
     */
    private resumeHeldTimeouts(): void {
        this.pendingRequests.forEach((pending, refId) => {
            if (!pending.timeoutPaused) return;
            pending.timeoutPaused = false;
            this.armTimeout(
                refId,
                pending,
                Math.max(pending.remainingMs ?? pending.timeoutMs, RESUMED_TIMEOUT_FLOOR_MS)
            );
        });
    }

    /**
     * [Internal] Dispatched requests still waiting for a reply, the one being dispatched excluded
     * (its own `dispatchedAt` is set just before this runs, so it is counted and taken back off).
     */
    private countInFlight(): number {
        let count = 0;
        this.pendingRequests.forEach(pending => {
            if (pending.dispatchedAt !== undefined) count += 1;
        });
        return Math.max(0, count - 1);
    }

    /**
     * [Internal] Hands one settled request to the observer. Only a request that was dispatched while
     * an observer was attached has a `dispatchedAt`, so one that never left — or left before
     * measuring began — reports nothing.
     *
     * The observer's own failure is swallowed: a measurement must never change what the caller
     * of `request` sees.
     */
    private reportSettled(pending: PendingRequest, outcome: string, responseLength?: number): void {
        const observer = this.requestObserver;
        if (!observer || pending.dispatchedAt === undefined) return;
        const settledAt = this.now();
        try {
            observer({
                type: pending.requestType,
                outcome,
                queuedMs: pending.calledAt === undefined ? undefined : pending.dispatchedAt - pending.calledAt,
                roundTripMs: settledAt - pending.dispatchedAt,
                requestLength: pending.requestLength,
                responseLength,
                inFlightAtDispatch: pending.inFlightAtDispatch ?? 0,
            });
        } catch (error) {
            logger.warn('BRIDGE', '[WebBridgeClient] request observer threw', { error });
        }
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
    private handleMessage = (message: ResponseMessage | EventMessage, meta?: InboundMessageMeta): void => {
        // A message from the host proves it can reach the page, so nothing held is waiting on a
        // delivery any more. The visible edge is otherwise the only thing that resumes a held timer,
        // and the hold must not outlive a page whose visibility state lags the app's real one.
        this.resumeHeldTimeouts();

        const refId = message.refId;

        // If it has a `success` property and refId is pending in the map, it's a Response to a request
        if ('success' in message && refId && this.pendingRequests.has(refId)) {
            this.handleResponse(message as ResponseMessage, meta);
        } else {
            // Treated as an event when it isn't in the pending map, or when it's one-way data
            this.handleEvent(message as EventMessage);
        }
    };

    /**
     * [Internal] Ends the lifetime of the matched pending request and settles (resolve/reject) its promise.
     */
    private handleResponse(message: ResponseMessage, meta?: InboundMessageMeta): void {
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
            this.reportSettled(pending, message.error?.code ?? 'ERROR', meta?.length);
            pending.reject(message.error);
            return;
        }

        // Runtime protocol guard: block if the result differs from the promised response type
        if (message.type !== pending.expectedResponseType) {
            this.reportSettled(pending, 'RESPONSE_TYPE_MISMATCH', meta?.length);
            pending.reject(
                this.createResponseTypeMismatchError(
                    pending,
                    typeof message.type === 'string' ? message.type : undefined
                )
            );
            return;
        }

        this.reportSettled(pending, 'ok', meta?.length);
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

        const requestMessage = this.createRequestMessage(message);
        if (!this.isReady) {
            this.pendingBuffer.enqueue(requestMessage);
        } else {
            this.adapter.postMessage(requestMessage);
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
                // Only while measuring: a request called before the observer was attached reports
                // no queue time rather than a wrong one.
                calledAt: this.requestObserver ? this.now() : undefined,
            });

            if (!this.isReady) {
                this.pendingBuffer.enqueue(requestMessage);
            } else {
                this.dispatchRequest(requestMessage);
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
        this.unsubscribeVisibility?.();
        this.unsubscribeVisibility = undefined;

        // 3. Empty the pending buffer queue
        this.pendingBuffer.clear();

        // 4. Reject every still-pending promise, then clear the map
        this.pendingRequests.forEach(pending => {
            if (pending.timeoutId) {
                clearTimeout(pending.timeoutId);
            }
            pending.reject({
                code: 'DESTROYED',
                message: 'The bridge client was destroyed, so this pending request was rejected.',
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
     * Starts or stops reporting settled requests. Off by default, and nothing is timed while off.
     */
    public setRequestObserver(observer?: BridgeRequestObserver): void {
        this.requestObserver = observer;
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
            message: 'Native bridge functionality is not available in a plain browser environment.',
            reason: 'No native bridge adapter became available before the configured readiness timeout.',
            requestType,
            protocolVersion: this.version,
            webVersion: this.version,
            recoverable: true,
        };
    }
}

/** The document's visibility where there is a DOM; absent elsewhere (SSR, a test without jsdom). */
const createDocumentVisibility = (): PageVisibilitySource | undefined => {
    if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') return undefined;
    return {
        isHidden: () => document.visibilityState === 'hidden',
        subscribe: listener => {
            document.addEventListener('visibilitychange', listener);
            return () => document.removeEventListener('visibilitychange', listener);
        },
    };
};

/** A monotonic clock where the runtime has one; wall-clock time otherwise. */
const defaultNow = (): number =>
    typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
