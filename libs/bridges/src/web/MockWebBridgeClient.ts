import type { BridgeAdapter } from './adapters';
import type {
    RequestType,
    ResponseType,
    EventType,
    TypedRequestMessage,
    TypedResponseMessage,
    TypedEventMessage,
    RequestPayloadMap,
    ResponsePayloadMap,
    EventPayloadMap,
    BridgePairMap,
} from '../common';
import type { IWebBridgeClient } from './IWebBridgeClient';

/**
 * 단위 테스트 및 로컬 웹 개발(Mock) 환경에서 사용되는 브릿지 클라이언트입니다.
 */
export class MockWebBridgeClient implements IWebBridgeClient {
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

    /**
     * App 역할을 하는 모의 어댑터로부터 메시지를 수신합니다.
     */
    private handleMessageFromApp = (
        message: TypedResponseMessage<ResponseType> | TypedEventMessage<EventType>
    ): void => {
        console.log(`[MockWebBridgeClient] App으로부터 메시지 수신:`, message);
        if ('success' in message) {
            this.handleResponse(message as TypedResponseMessage<ResponseType>);
        } else {
            this.handleEvent(message as TypedEventMessage<EventType>);
        }
    };

    private handleResponse(message: TypedResponseMessage<ResponseType>): void {
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

    private handleEvent(message: TypedEventMessage<EventType>): void {
        console.log(`[MockWebBridgeClient] '${message.type}' 이벤트 처리.`);
        const listeners = this.eventListeners.get(message.type);
        listeners?.forEach(listener => listener(message.payload));
    }

    private generateRefId = () => Math.random().toString(36).substring(2, 9);

    public post<K extends RequestType>(type: K, payload?: RequestPayloadMap[K]): void {
        console.log(`[MockWebBridgeClient] POST 발송: type='${String(type)}'`, payload);
        const message: TypedRequestMessage<K> = {
            type,
            refId: this.generateRefId(),
            version: this.version,
            payload: (payload ?? {}) as RequestPayloadMap[K],
        };
        this.adapter.postMessage(message);
    }

    public request<K extends RequestType>(
        type: K,
        payload?: RequestPayloadMap[K]
    ): Promise<ResponsePayloadMap[BridgePairMap[K]]> {
        console.log(`[MockWebBridgeClient] REQUEST 발송: type='${String(type)}'`, payload);
        return new Promise((resolve, reject) => {
            const refId = this.generateRefId();
            const message: TypedRequestMessage<K> = {
                type,
                refId,
                version: this.version,
                payload: (payload ?? {}) as RequestPayloadMap[K],
            };

            const timeoutId = setTimeout(() => {
                this.pendingRequests.delete(refId);
                reject({ code: 'TIMEOUT', message: 'Mock Request Timed Out' });
            }, this.timeoutMs);

            this.pendingRequests.set(refId, {
                resolve,
                reject,
                timeoutId,
            });

            this.adapter.postMessage(message);
        });
    }

    public send<K extends RequestType>(message: {
        type: K;
        payload?: RequestPayloadMap[K];
    }): Promise<ResponsePayloadMap[BridgePairMap[K]]> {
        return this.request(message.type, message.payload);
    }

    public onEvent<K extends EventType>(type: K, handler: (payload: EventPayloadMap[K]) => void): () => void {
        const typeStr = type as string;
        console.log(`[MockWebBridgeClient] '${typeStr}' 이벤트 구독 설정.`);
        if (!this.eventListeners.has(typeStr)) {
            this.eventListeners.set(typeStr, new Set());
        }
        this.eventListeners.get(typeStr)?.add(handler as any);

        return () => {
            this.eventListeners.get(typeStr)?.delete(handler as any);
        };
    }
}
