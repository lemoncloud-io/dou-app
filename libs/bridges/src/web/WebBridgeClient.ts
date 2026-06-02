import type { BridgeAdapter } from './adapters';
import type { EventMessage, IMessageQueue, RequestMessage, ResponseMessage } from '../common';
import { MessageQueue } from '../common';
import type { IWebBridgeClient } from './IWebBridgeClient';
import type { AppMessageData, AppMessageType, WebMessageData, WebMessageType } from '@chatic/app-messages';

export interface WebBridgeClientConfig {
    adapter: BridgeAdapter;
    version?: string;
    timeoutMs?: number;
    pendingBuffer?: IMessageQueue<RequestMessage>;
}

interface PendingRequest {
    resolve: (value: any) => void;
    reject: (reason: any) => void;
    timeoutId?: ReturnType<typeof setTimeout>;
    timeoutMs: number;
}

export class WebBridgeClient implements IWebBridgeClient {
    private adapter: BridgeAdapter;
    private version: string;
    private timeoutMs: number;

    private eventListeners = new Map<string, Set<(message: any) => void>>();
    private pendingRequests = new Map<string, PendingRequest>();

    private isReady = false;
    private pendingBuffer: IMessageQueue<RequestMessage>;

    constructor(config: WebBridgeClientConfig) {
        this.adapter = config.adapter;
        this.version = config.version ?? '2.0.0';
        this.timeoutMs = config.timeoutMs ?? 10000;
        this.pendingBuffer = config.pendingBuffer ?? new MessageQueue();

        this.adapter.onMessage(this.handleMessage);
        this.initBridgeDetection();
    }

    private checkBridgeAvailable(): boolean {
        if (typeof window === 'undefined') return false;
        return !!(
            window.ReactNativeWebView?.postMessage ||
            window.ChaticMessageHandler?.postMessage ||
            window.webkit?.messageHandlers?.ChaticMessageHandler?.postMessage
        );
    }

    private initBridgeDetection(): void {
        if (this.checkBridgeAvailable()) {
            this.isReady = true;
            this.flushBuffer();
            return;
        }

        const intervalId = setInterval(() => {
            if (this.checkBridgeAvailable()) {
                clearInterval(intervalId);
                this.isReady = true;
                this.flushBuffer();
            }
        }, 50);

        setTimeout(() => clearInterval(intervalId), 10000);
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
                pending.timeoutId = setTimeout(() => {
                    this.pendingRequests.delete(refId);
                    pending.reject({
                        code: 'TIMEOUT',
                        message: `Request timed out after ${pending.timeoutMs}ms`,
                    });
                }, pending.timeoutMs);
            }
        }

        this.adapter.postMessage(message);
    }

    private handleMessage = (message: ResponseMessage | EventMessage): void => {
        const refId = message.refId; // 지역 변수 할당

        if ('success' in message && refId && this.pendingRequests.has(refId)) {
            this.handleResponse(message as ResponseMessage);
        } else {
            this.handleEvent(message as EventMessage);
        }
    };

    private handleResponse(message: ResponseMessage): void {
        const refId = message.refId;
        if (!refId) return;

        const pending = this.pendingRequests.get(refId);
        if (!pending) return;

        if (pending.timeoutId) {
            clearTimeout(pending.timeoutId);
        }
        this.pendingRequests.delete(refId);

        if (message.success) {
            pending.resolve(message);
        } else {
            pending.reject(message.error);
        }
    }

    private handleEvent(message: EventMessage): void {
        const listeners = this.eventListeners.get(message.type);
        listeners?.forEach(listener => listener(message));
    }

    private generateRefId(): string {
        return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
    }

    public post<K extends WebMessageType>(type: K, messageParams?: Omit<WebMessageData<K>, 'type'>): void {
        const message = {
            type,
            version: this.version,
            ...messageParams,
            refId: messageParams?.refId ?? this.generateRefId(),
        } as unknown as RequestMessage;

        if (!this.isReady) {
            this.pendingBuffer.enqueue(message);
        } else {
            this.adapter.postMessage(message);
        }
    }

    public request<K extends WebMessageType>(
        type: K,
        messageParams?: Omit<WebMessageData<K>, 'type'>,
        customTimeoutMs?: number
    ): Promise<ResponseMessage> {
        return new Promise((resolve, reject) => {
            const refId = messageParams?.refId ?? this.generateRefId();
            const message = {
                type,
                version: this.version,
                ...messageParams,
                refId, // pendingRequest 매핑 무결성을 위해 하단 배치
            } as unknown as RequestMessage;

            this.pendingRequests.set(refId, {
                resolve,
                reject,
                timeoutMs: customTimeoutMs ?? this.timeoutMs,
            });

            if (!this.isReady) {
                this.pendingBuffer.enqueue(message);
            } else {
                this.dispatchRequest(message);
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
}
