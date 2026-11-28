import { logger } from '@chatic/logger';

import type { BridgeAdapter, InboundMessageMeta } from './adapters/types';
import {
    BRIDGE_VERSION,
    MessageQueue,
    type EventMessage,
    type IMessageQueue,
    type RequestMessage,
    type ResponseMessage,
} from '@chatic/bridge-host';

import { isNative } from '../common';
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
} from '@chatic/bridge-messages';

const RESUMED_TIMEOUT_FLOOR_MS = 2000;

export class WebBridgeClient implements IWebBridgeClient {
    private adapter: BridgeAdapter;
    private version: string;
    private timeoutMs: number;
    private bridgeReadyTimeoutMs: number;
    private isBridgeAvailable: () => boolean;
    private now: () => number;
    private requestObserver?: BridgeRequestObserver;
    private visibility?: PageVisibilitySource;
    private unsubscribeVisibility?: () => void;

    private eventListeners = new Map<string, Set<(message: any) => void>>();
    private pendingRequests = new Map<string, PendingRequest>();

    private isReady = false;
    private availabilityFailed = false;
    private pendingBuffer: IMessageQueue<RequestMessage>;

    private unsubscribeAdapter?: () => void;
    private detectionIntervalId?: ReturnType<typeof setInterval>;
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

        this.unsubscribeAdapter = this.adapter.onMessage(this.handleMessage);

        this.initBridgeDetection();
    }

    private initBridgeDetection(): void {
        if (typeof window === 'undefined') {
            this.failBufferedRequests();
            return;
        }

        if (this.isBridgeAvailable()) {
            this.isReady = true;
            this.flushBuffer();
            return;
        }

        this.detectionIntervalId = setInterval(() => {
            if (this.isBridgeAvailable()) {
                this.clearDetectionTimers();
                this.isReady = true;
                this.flushBuffer();
            }
        }, 50);

        this.detectionTimeoutId = setTimeout(() => {
            this.clearDetectionTimers();
            if (!this.isReady) {
                this.failBufferedRequests();
            }
        }, this.bridgeReadyTimeoutMs);
    }

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

    private flushBuffer(): void {
        while (!this.pendingBuffer.isEmpty()) {
            const message = this.pendingBuffer.dequeue();
            if (message) {
                const refId = message.refId;
                if (refId && this.pendingRequests.has(refId)) {
                    this.dispatchRequest(message);
                } else {
                    this.adapter.postMessage(message);
                }
            }
        }
    }

    private dispatchRequest(message: RequestMessage): void {
        const refId = message.refId;

        if (refId) {
            const pending = this.pendingRequests.get(refId);
            if (pending) {
                if (this.requestObserver) {
                    pending.dispatchedAt = this.now();
                    pending.inFlightAtDispatch = this.countInFlight();
                }
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

    private handleVisibilityChange = (): void => {
        if (this.visibility?.isHidden()) {
            this.holdTimeouts();
        } else {
            this.resumeHeldTimeouts();
        }
    };

    private holdTimeouts(): void {
        const now = defaultNow();
        this.pendingRequests.forEach(pending => {
            if (!pending.timeoutId || pending.armedAt === undefined) return;
            clearTimeout(pending.timeoutId);
            pending.timeoutId = undefined;
            const left = (pending.remainingMs ?? pending.timeoutMs) - (now - pending.armedAt);
            pending.remainingMs = Math.min(pending.timeoutMs, Math.max(0, left));
            pending.timeoutPaused = true;
        });
    }

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

    private countInFlight(): number {
        let count = 0;
        this.pendingRequests.forEach(pending => {
            if (pending.dispatchedAt !== undefined) count += 1;
        });
        return Math.max(0, count - 1);
    }

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

    private failBufferedRequests(): void {
        this.availabilityFailed = true;
        this.pendingBuffer.clear();

        this.pendingRequests.forEach(pending => {
            if (pending.timeoutId) return;
            pending.reject(this.createNativeNotSupportedError(pending.requestType));
        });

        [...this.pendingRequests.entries()].forEach(([refId, pending]) => {
            if (!pending.timeoutId) this.pendingRequests.delete(refId);
        });
    }

    private handleMessage = (message: ResponseMessage | EventMessage, meta?: InboundMessageMeta): void => {
        this.resumeHeldTimeouts();

        const refId = message.refId;

        if ('success' in message && refId && this.pendingRequests.has(refId)) {
            this.handleResponse(message as ResponseMessage, meta);
        } else {
            this.handleEvent(message as EventMessage);
        }
    };

    private handleResponse(message: ResponseMessage, meta?: InboundMessageMeta): void {
        const refId = message.refId;
        if (!refId) return;

        const pending = this.pendingRequests.get(refId);
        if (!pending) return;

        if (pending.timeoutId) {
            clearTimeout(pending.timeoutId);
        }
        this.pendingRequests.delete(refId);

        if (!message.success) {
            this.reportSettled(pending, message.error?.code ?? 'ERROR', meta?.length);
            pending.reject(message.error);
            return;
        }

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

    private handleEvent(message: EventMessage): void {
        const listeners = this.eventListeners.get(message.type);
        listeners?.forEach(listener => listener(message));
    }

    private generateRefId(): string {
        return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
    }

    public post<K extends WebMessageType>(message: WebMessageData<K>): void {
        const type = message.type;
        if (this.availabilityFailed) {
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
                calledAt: this.requestObserver ? this.now() : undefined,
            });

            if (!this.isReady) {
                this.pendingBuffer.enqueue(requestMessage);
            } else {
                this.dispatchRequest(requestMessage);
            }
        });
    }

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

    public destroy(): void {
        this.clearDetectionTimers();

        if (this.unsubscribeAdapter) {
            this.unsubscribeAdapter();
            this.unsubscribeAdapter = undefined;
        }
        this.unsubscribeVisibility?.();
        this.unsubscribeVisibility = undefined;

        this.pendingBuffer.clear();

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

    public setRequestObserver(observer?: BridgeRequestObserver): void {
        this.requestObserver = observer;
    }

    public setAdapter(adapter: BridgeAdapter): void {
        if (this.unsubscribeAdapter) {
            this.unsubscribeAdapter();
        }
        this.adapter = adapter;
        this.unsubscribeAdapter = this.adapter.onMessage(this.handleMessage);
    }

    private createRequestMessage<K extends WebMessageType>(message: WebMessageData<K>): RequestMessage {
        return {
            version: this.version,
            ...message,
            refId: message.refId ?? this.generateRefId(),
        } as unknown as RequestMessage;
    }

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

const defaultNow = (): number =>
    typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
