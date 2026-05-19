import type { BridgeAdapter } from './adapters/BridgeAdapter';
import type { RequestMessage, ResponseMessage, EventMessage, PayloadMap } from '../common';
import type { IWebBridgeClient } from './IWebBridgeClient';

export class MockWebBridgeClient<
    TWebReqMap extends PayloadMap = PayloadMap,
    TAppResMap extends PayloadMap = PayloadMap,
    TAppEvtMap extends PayloadMap = PayloadMap,
> implements IWebBridgeClient<TWebReqMap, TAppResMap, TAppEvtMap>
{
    private adapter: BridgeAdapter;
    private version = '1.0.0-mock';
    private timeoutMs = 5000;

    private eventListeners: Map<string, Set<(payload: any) => void>> = new Map();
    private pendingRequests: Map<
        string,
        { resolve: (value: any) => void; reject: (reason: any) => void; timeoutId: NodeJS.Timeout }
    > = new Map();

    constructor(config: { adapter: BridgeAdapter }) {
        this.adapter = config.adapter;
        this.adapter.onMessage(this.handleMessageFromApp);
        console.log('[MockWebBridgeClient] 초기화 및 어댑터와 연결되었습니다.');
    }

    private handleMessageFromApp = (message: ResponseMessage | EventMessage): void => {
        console.log(`[MockWebBridgeClient] App으로부터 메시지 수신:`, message);
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
            console.log(`[MockWebBridgeClient] 요청 '${message.refId}'에 대한 성공 응답 처리.`);
            pending.resolve(message.data);
        } else {
            console.log(`[MockWebBridgeClient] 요청 '${message.refId}'에 대한 실패 응답 처리.`);
            pending.reject(message.error);
        }
    }

    private handleEvent(message: EventMessage): void {
        console.log(`[MockWebBridgeClient] '${message.type}' 이벤트 처리.`);
        const listeners = this.eventListeners.get(message.type);
        listeners?.forEach(listener => listener(message.payload));
    }

    private generateRefId = () => Math.random().toString(36).substring(2, 9);

    public post<K extends keyof TWebReqMap>(
        type: K,
        payload?: TWebReqMap[K] extends { data: infer D } ? D : TWebReqMap[K]
    ): void {
        console.log(`[MockWebBridgeClient] POST: type='${String(type)}'`, payload);
        const message: RequestMessage = { type: type as string, version: this.version, payload };
        this.adapter.postMessage(message);
    }

    public request<K extends keyof TWebReqMap>(
        type: K,
        payload?: TWebReqMap[K] extends { data: infer D } ? D : TWebReqMap[K]
    ): Promise<{
        data: K extends keyof TAppResMap ? (TAppResMap[K] extends { data: infer D } ? D : TAppResMap[K]) : unknown;
    }> {
        console.log(`[MockWebBridgeClient] REQUEST: type='${String(type)}'`, payload);
        return new Promise((resolve, reject) => {
            const refId = this.generateRefId();
            const message: RequestMessage = { type: type as string, refId, version: this.version, payload };

            const timeoutId = setTimeout(() => {
                this.pendingRequests.delete(refId);
                reject({ code: 'TIMEOUT', message: 'Mock Request Timed Out' });
            }, this.timeoutMs);

            this.pendingRequests.set(refId, {
                resolve: (data: any) => resolve({ data }),
                reject,
                timeoutId,
            });

            this.adapter.postMessage(message);
        });
    }

    public send<K extends keyof TWebReqMap>(message: {
        type: K;
        payload?: TWebReqMap[K] extends { data: infer D } ? D : TWebReqMap[K];
    }): Promise<{
        data: K extends keyof TAppResMap ? (TAppResMap[K] extends { data: infer D } ? D : TAppResMap[K]) : unknown;
    }> {
        return this.request(message.type, message.payload);
    }

    public onEvent<K extends keyof TAppEvtMap>(
        type: K,
        handler: (payload: TAppEvtMap[K] extends { data: infer D } ? D : TAppEvtMap[K]) => void
    ): () => void {
        const typeStr = type as string;
        console.log(`[MockWebBridgeClient] '${typeStr}' 이벤트 구독 설정.`);
        if (!this.eventListeners.has(typeStr)) {
            this.eventListeners.set(typeStr, new Set());
        }
        this.eventListeners.get(typeStr)!.add(handler as any);

        return () => {
            this.eventListeners.get(typeStr)?.delete(handler as any);
        };
    }
}
