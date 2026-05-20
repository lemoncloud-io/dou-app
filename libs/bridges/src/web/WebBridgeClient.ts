import type { BridgeAdapter } from './adapters';
import type { EventMessage, RequestMessage, ResponseMessage } from '../common';
import type { BridgeResponseMessage } from '../common/types';
import type { IWebBridgeClient } from './IWebBridgeClient';
import type { AppMessageData, EventMessageType, WebMessageData, WebMessageType } from '@chatic/app-messages';

export interface WebBridgeClientConfig {
    adapter: BridgeAdapter;
    version?: string;
    timeoutMs?: number;
}

interface PendingRequest {
    resolve: (value: any) => void;
    reject: (reason: any) => void;
    timeoutId: ReturnType<typeof setTimeout>;
}

export class WebBridgeClient implements IWebBridgeClient {
    private adapter: BridgeAdapter;
    private version: string;
    private timeoutMs: number;

    private eventListeners = new Map<string, Set<(message: any) => void>>();
    private pendingRequests = new Map<string, PendingRequest>();

    constructor(config: WebBridgeClientConfig) {
        this.adapter = config.adapter;
        this.version = config.version ?? '2.0.0';
        this.timeoutMs = config.timeoutMs ?? 10000;

        this.adapter.onMessage(this.handleMessage);
    }

    private handleMessage = (message: ResponseMessage | EventMessage): void => {
        if ('success' in message && message.refId) {
            this.handleResponse(message as ResponseMessage);
        } else {
            this.handleEvent(message as EventMessage);
        }
    };

    private handleResponse(message: ResponseMessage): void {
        const pending = this.pendingRequests.get(message.refId!);
        if (!pending) return;

        clearTimeout(pending.timeoutId);
        this.pendingRequests.delete(message.refId!);

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

        this.adapter.postMessage(message);
    }

    public request<K extends WebMessageType>(
        type: K,
        messageParams?: Omit<WebMessageData<K>, 'type'>,
        customTimeoutMs?: number
    ): Promise<BridgeResponseMessage<K>> {
        return new Promise((resolve, reject) => {
            const refId = messageParams?.refId ?? this.generateRefId();
            const message = {
                type,
                version: this.version,
                ...messageParams,
                refId, // pendingRequest 매핑 무결성을 위해 하단 배치
            } as unknown as RequestMessage;

            const timeoutId = setTimeout(() => {
                this.pendingRequests.delete(refId);
                reject({ code: 'TIMEOUT', message: `Request timed out after ${customTimeoutMs ?? this.timeoutMs}ms` });
            }, customTimeoutMs ?? this.timeoutMs);

            this.pendingRequests.set(refId, { resolve, reject, timeoutId });
            this.adapter.postMessage(message);
        });
    }

    public send<K extends WebMessageType>(
        message: WebMessageData<K>,
        customTimeoutMs?: number
    ): Promise<BridgeResponseMessage<K>> {
        const { type, ...rest } = message;
        return this.request(type as K, rest as Omit<WebMessageData<K>, 'type'>, customTimeoutMs);
    }

    public onEvent<K extends EventMessageType>(type: K, handler: (message: AppMessageData<K>) => void): () => void {
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
