import type { BridgeAdapter } from './adapters/BridgeAdapter';
import type { RequestMessage, ResponseMessage, EventMessage, PayloadMap } from '../common';
import type { IWebBridgeClient } from './IWebBridgeClient';

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

export class WebBridgeClient<
    TWebReqMap extends PayloadMap = PayloadMap,
    TAppResMap extends PayloadMap = PayloadMap,
    TAppEvtMap extends PayloadMap = PayloadMap,
> implements IWebBridgeClient<TWebReqMap, TAppResMap, TAppEvtMap>
{
    private adapter: BridgeAdapter;
    private version: string;
    private timeoutMs: number;

    private eventListeners: Map<string, Set<(payload: any) => void>> = new Map();
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
        listeners?.forEach(listener => listener(message.payload));
    }

    private generateRefId(): string {
        return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
    }

    public post<K extends keyof TWebReqMap>(
        type: K,
        payload?: TWebReqMap[K] extends { data: infer D } ? D : TWebReqMap[K]
    ): void {
        const message: RequestMessage = { type: type as string, version: this.version, payload };
        this.adapter.postMessage(message);
    }

    public request<K extends keyof TWebReqMap>(
        type: K,
        payload?: TWebReqMap[K] extends { data: infer D } ? D : TWebReqMap[K],
        customTimeoutMs?: number
    ): Promise<{
        data: K extends keyof TAppResMap ? (TAppResMap[K] extends { data: infer D } ? D : TAppResMap[K]) : unknown;
    }> {
        return new Promise((resolve, reject) => {
            const refId = this.generateRefId();
            const message: RequestMessage = { type: type as string, refId, version: this.version, payload };
            const timeoutId = setTimeout(() => {
                this.pendingRequests.delete(refId);
                reject({ code: 'TIMEOUT', message: `Request timed out after ${customTimeoutMs}ms` });
            }, customTimeoutMs ?? this.timeoutMs);
            this.pendingRequests.set(refId, { resolve: (data: any) => resolve({ data }), reject, timeoutId });
            this.adapter.postMessage(message);
        });
    }

    public send<K extends keyof TWebReqMap>(
        message: { type: K; payload?: TWebReqMap[K] extends { data: infer D } ? D : TWebReqMap[K] },
        customTimeoutMs?: number
    ): Promise<{
        data: K extends keyof TAppResMap ? (TAppResMap[K] extends { data: infer D } ? D : TAppResMap[K]) : unknown;
    }> {
        return this.request(message.type, message.payload, customTimeoutMs);
    }

    public onEvent<K extends keyof TAppEvtMap>(
        type: K,
        handler: (payload: TAppEvtMap[K] extends { data: infer D } ? D : TAppEvtMap[K]) => void
    ): () => void {
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
