import type { BridgeAdapter } from './adapters/BridgeAdapter';
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

/**
 * Web(React 등) 환경에서 App(React Native, iOS, Android)과 통신하기 위한 브릿지 클라이언트 구현체입니다.
 */
export class WebBridgeClient implements IWebBridgeClient {
    private adapter: BridgeAdapter;
    private version: string;
    private timeoutMs: number;

    private eventListeners: Map<string, Set<(payload: any) => void>> = new Map();
    private pendingRequests: Map<string, PendingRequest> = new Map();

    constructor(config: WebBridgeClientConfig) {
        this.adapter = config.adapter;
        this.version = config.version ?? '2.0.0';
        this.timeoutMs = config.timeoutMs ?? 10000;

        // 브릿지 어댑터로부터 들어오는 메시지 수신부 바인딩
        this.adapter.onMessage(this.handleMessage);
    }

    /**
     * 어댑터로부터 수신된 메시지를 타입(Response vs Event)에 맞게 라우팅합니다.
     */
    private handleMessage = (message: TypedResponseMessage<ResponseType> | TypedEventMessage<EventType>): void => {
        // 'success' 필드가 존재하면 Request에 대한 응답(Response)으로 간주
        if ('success' in message) {
            this.handleResponse(message as TypedResponseMessage<ResponseType>);
        } else {
            // 그렇지 않다면 단방향 발송 이벤트(Event)로 간주
            this.handleEvent(message as TypedEventMessage<EventType>);
        }
    };

    /**
     * Request-Response 패턴의 응답을 처리합니다.
     */
    private handleResponse(message: TypedResponseMessage<ResponseType>): void {
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

    /**
     * App에서 발생한 단방향 이벤트를 구독자들에게 브로드캐스트합니다.
     */
    private handleEvent(message: TypedEventMessage<EventType>): void {
        const listeners = this.eventListeners.get(message.type);
        listeners?.forEach(listener => listener(message.payload));
    }

    /**
     * 모든 발송 메시지에 부여되는 고유 식별자(refId)를 생성합니다.
     */
    private generateRefId(): string {
        return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
    }

    public post<K extends RequestType>(type: K, payload?: RequestPayloadMap[K]): void {
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
        payload?: RequestPayloadMap[K],
        customTimeoutMs?: number
    ): Promise<ResponsePayloadMap[BridgePairMap[K]]> {
        return new Promise((resolve, reject) => {
            const refId = this.generateRefId();
            const message: TypedRequestMessage<K> = {
                type,
                refId,
                version: this.version,
                payload: (payload ?? {}) as RequestPayloadMap[K],
            };

            // 타임아웃 타이머 설정
            const timeoutId = setTimeout(() => {
                this.pendingRequests.delete(refId);
                reject({ code: 'TIMEOUT', message: `Request timed out after ${customTimeoutMs ?? this.timeoutMs}ms` });
            }, customTimeoutMs ?? this.timeoutMs);

            // 대기열에 등록 후 메시지 발송
            this.pendingRequests.set(refId, { resolve, reject, timeoutId });
            this.adapter.postMessage(message);
        });
    }

    public send<K extends RequestType>(
        message: { type: K; payload?: RequestPayloadMap[K] },
        customTimeoutMs?: number
    ): Promise<ResponsePayloadMap[BridgePairMap[K]]> {
        return this.request(message.type, message.payload, customTimeoutMs);
    }

    public onEvent<K extends EventType>(type: K, handler: (payload: EventPayloadMap[K]) => void): () => void {
        const typeStr = type as string;
        if (!this.eventListeners.has(typeStr)) {
            this.eventListeners.set(typeStr, new Set());
        }

        const listeners = this.eventListeners.get(typeStr)!;
        listeners.add(handler as any);

        // 구독 해제(Cleanup) 함수 반환
        return () => {
            listeners.delete(handler as any);
            if (listeners.size === 0) this.eventListeners.delete(typeStr);
        };
    }
}
