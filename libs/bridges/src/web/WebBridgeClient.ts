import type { BridgeAdapter } from './adapters';
import type {
    EventMessage,
    EventMessageType,
    ExtractEvtMessage,
    ExtractReqMessage,
    ExtractResMessage,
    RequestMessage,
    ResponseMessage,
} from '../common';
import type { IWebBridgeClient } from './IWebBridgeClient';
import type { WebMessageType } from '@chatic/app-messages';

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

    private eventListeners: Map<string, Set<(message: any) => void>> = new Map();
    private pendingRequests: Map<string, PendingRequest> = new Map();

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
        const pending = this.pendingRequests.get(message.refId);
        if (!pending) return;

        clearTimeout(pending.timeoutId);
        this.pendingRequests.delete(message.refId);

        if (message.success) {
            pending.resolve(message.data);
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

    public post<K extends WebMessageType>(type: K, messageParams?: Omit<ExtractReqMessage<K>, 'type'>): void {
        const message = {
            type,
            refId: this.generateRefId(),
            version: this.version,
            ...messageParams,
        } as unknown as RequestMessage;

        this.adapter.postMessage(message);
    }

    public request<K extends WebMessageType>(
        type: K,
        messageParams?: Omit<ExtractReqMessage<K>, 'type'>,
        customTimeoutMs?: number
    ): Promise<ExtractResMessage<K>> {
        return new Promise((resolve, reject) => {
            const refId = this.generateRefId();
            const message = {
                type,
                refId,
                version: this.version,
                ...messageParams,
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
        message: ExtractReqMessage<K>,
        customTimeoutMs?: number
    ): Promise<ExtractResMessage<K>> {
        const { type, ...rest } = message;
        return this.request(type as K, rest as Omit<ExtractReqMessage<K>, 'type'>, customTimeoutMs);
    }

    public onEvent<K extends EventMessageType>(type: K, handler: (message: ExtractEvtMessage<K>) => void): () => void {
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
